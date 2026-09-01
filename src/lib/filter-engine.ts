// src/lib/filter-engine.ts
// The bitset filter engine (docs/astro-rewrite-spec.md D4). Built once from
// filter-index.json at island startup; every filter change re-runs filter() +
// facetCounts() synchronously. Model ordinal 0 = newest (build-filter-index.mjs
// sorts that way), so an ascending ordinal list is already "newest first".

export interface FilterModel {
  id: string;
  n: string;
  nl: string;
  t: number[];
  s: number;
  r: number | null;
  th: string;
}

export interface FilterIndex {
  tags: string[];
  subs: string[];
  rels: string[];
  models: FilterModel[];
}

export type TagMode = 'AND' | 'OR';
export type SortMode = 'newest' | 'name' | 'release';

export interface FilterState {
  tags: number[];
  tagMode: TagMode;
  subs: number[];
  rels: number[];
  query: string;
  sort: SortMode;
}

export function emptyState(): FilterState {
  return { tags: [], tagMode: 'AND', subs: [], rels: [], query: '', sort: 'newest' };
}

export interface FacetCounts {
  tags: number[]; // parallel to index.tags
  subs: number[];
  rels: number[];
}

type Bitset = Uint32Array;

// --- bit ops -------------------------------------------------------------

function popcount32(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function popcount(bs: Bitset): number {
  let c = 0;
  for (let i = 0; i < bs.length; i++) c += popcount32(bs[i]);
  return c;
}

// --- engine ------------------------------------------------------------

export class FilterEngine {
  readonly index: FilterIndex;
  readonly count: number;
  private readonly words: number;
  private readonly all: Bitset;
  private readonly tagBits: Bitset[];
  private readonly subBits: Bitset[];
  private readonly relBits: Bitset[];

  constructor(index: FilterIndex) {
    this.index = index;
    this.count = index.models.length;
    this.words = Math.ceil(this.count / 32) || 1;

    const make = () => new Uint32Array(this.words);
    this.tagBits = index.tags.map(make);
    this.subBits = index.subs.map(make);
    this.relBits = index.rels.map(make);

    this.all = make();
    for (let i = 0; i < this.count; i++) {
      const w = i >>> 5;
      const bit = 1 << (i & 31);
      this.all[w] |= bit;
      const m = index.models[i];
      for (const t of m.t) this.tagBits[t][w] |= bit;
      if (m.s >= 0 && m.s < this.subBits.length) this.subBits[m.s][w] |= bit;
      if (m.r !== null && m.r >= 0 && m.r < this.relBits.length) this.relBits[m.r][w] |= bit;
    }
  }

  /** Result set as a bitset. Out-of-range ids (stale URL) are ignored. */
  private resultBits(state: FilterState): Bitset {
    const out = this.all.slice();
    const tags = state.tags.filter((t) => this.tagBits[t]);
    const subs = state.subs.filter((s) => this.subBits[s]);
    const rels = state.rels.filter((r) => this.relBits[r]);

    if (subs.length) {
      const union = new Uint32Array(this.words);
      for (const s of subs) orInto(union, this.subBits[s]);
      andInto(out, union);
    }
    if (rels.length) {
      const union = new Uint32Array(this.words);
      for (const r of rels) orInto(union, this.relBits[r]);
      andInto(out, union);
    }
    if (tags.length) {
      if (state.tagMode === 'OR') {
        const union = new Uint32Array(this.words);
        for (const t of tags) orInto(union, this.tagBits[t]);
        andInto(out, union);
      } else {
        for (const t of tags) andInto(out, this.tagBits[t]);
      }
    }
    if (state.query.trim()) {
      const q = state.query.trim().toLowerCase();
      const qbits = new Uint32Array(this.words);
      for (let i = 0; i < this.count; i++) {
        if (this.index.models[i].nl.includes(q)) qbits[i >>> 5] |= 1 << (i & 31);
      }
      andInto(out, qbits);
    }
    return out;
  }

  /** Ordered array of model ordinals (indices into index.models). */
  filter(state: FilterState): number[] {
    const bits = this.resultBits(state);
    const ords: number[] = [];
    for (let w = 0; w < bits.length; w++) {
      const word = bits[w];
      if (!word) continue;
      const base = w << 5;
      for (let b = 0; b < 32; b++) {
        if ((word >>> b) & 1) ords.push(base + b);
      }
    }
    // ords is ascending == newest-first already (ordinal 0 = newest).
    if (state.sort === 'name') {
      ords.sort((a, b) => cmp(this.index.models[a].nl, this.index.models[b].nl));
    } else if (state.sort === 'release') {
      ords.sort((a, b) => {
        const ra = this.index.models[a].r;
        const rb = this.index.models[b].r;
        if (ra !== rb) return (ra ?? Infinity) - (rb ?? Infinity);
        return cmp(this.index.models[a].nl, this.index.models[b].nl);
      });
    }
    return ords;
  }

  /**
   * Per-value counts for the facet panel: how many models would be in the
   * result if that value were additionally selected in its group (AND mode
   * shrinks for tags; OR mode / subs / rels widen within the group).
   * Already-selected values report the current result size.
   */
  facetCounts(state: FilterState): FacetCounts {
    const current = popcount(this.resultBits(state));
    const withAdded = (group: 'tags' | 'subs' | 'rels', v: number): number => {
      if (state[group].includes(v)) return current;
      return popcount(this.resultBits({ ...state, [group]: [...state[group], v] }));
    };
    return {
      tags: this.index.tags.map((_, i) => withAdded('tags', i)),
      subs: this.index.subs.map((_, i) => withAdded('subs', i)),
      rels: this.index.rels.map((_, i) => withAdded('rels', i)),
    };
  }
}

function orInto(a: Bitset, b: Bitset): void {
  for (let i = 0; i < a.length; i++) a[i] |= b[i];
}
function andInto(a: Bitset, b: Bitset): void {
  for (let i = 0; i < a.length; i++) a[i] &= b[i];
}
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
