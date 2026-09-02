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

  /** Bitset of models whose lowercased name contains `q`. `this.all` if `q` empty. */
  private queryMask(query: string): Bitset {
    const q = query.trim().toLowerCase();
    if (!q) return this.all;
    const bits = new Uint32Array(this.words);
    for (let i = 0; i < this.count; i++) {
      if (this.index.models[i].nl.includes(q)) bits[i >>> 5] |= 1 << (i & 31);
    }
    return bits;
  }

  /**
   * All the pieces facetCounts needs, computed once: the per-group masks, the
   * final result, and the result with each single group's constraint removed
   * (so a facet count is a couple of bitset ops, not a full re-filter).
   */
  private compute(state: FilterState) {
    const W = this.words;
    const tags = state.tags.filter((t) => this.tagBits[t]);
    const subs = state.subs.filter((s) => this.subBits[s]);
    const rels = state.rels.filter((r) => this.relBits[r]);

    const subMask = subs.length ? unionOf(subs.map((s) => this.subBits[s]), W) : this.all;
    const relMask = rels.length ? unionOf(rels.map((r) => this.relBits[r]), W) : this.all;
    let tagMask: Bitset;
    if (!tags.length) {
      tagMask = this.all;
    } else if (state.tagMode === 'OR') {
      tagMask = unionOf(tags.map((t) => this.tagBits[t]), W);
    } else {
      tagMask = this.all.slice();
      for (const t of tags) andInto(tagMask, this.tagBits[t]);
    }
    const qMask = this.queryMask(state.query);

    const isect = (...masks: Bitset[]): Bitset => {
      const out = this.all.slice();
      for (const m of masks) if (m !== this.all) andInto(out, m);
      return out;
    };

    return {
      tags,
      subs,
      rels,
      subMask,
      relMask,
      tagMask,
      qMask,
      result: isect(subMask, relMask, tagMask, qMask),
      baseNoTags: isect(subMask, relMask, qMask),
      baseNoSubs: isect(relMask, tagMask, qMask),
      baseNoRels: isect(subMask, tagMask, qMask),
    };
  }

  /** Ordered array of model ordinals (indices into index.models). */
  filter(state: FilterState): number[] {
    const bits = this.compute(state).result;
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
    const c = this.compute(state);
    const cur = popcount(c.result);
    const W = this.words;
    const scratch = new Uint32Array(W);

    const orMode = c.tags.length > 0 && state.tagMode === 'OR';
    const tagCount = (i: number): number => {
      if (c.tags.includes(i)) return cur;
      const tb = this.tagBits[i];
      if (!tb) return cur;
      if (orMode) {
        // result | (baseNoTags & tag)
        for (let w = 0; w < W; w++) scratch[w] = c.result[w] | (c.baseNoTags[w] & tb[w]);
      } else {
        // AND mode / no tags selected: result & tag
        for (let w = 0; w < W; w++) scratch[w] = c.result[w] & tb[w];
      }
      return popcount(scratch);
    };

    // subs/rels are OR-within-group: adding a value widens that group's union.
    const groupCount = (
      baseNo: Bitset,
      union: Bitset,
      bit: Bitset | undefined,
      selected: number[],
      i: number
    ): number => {
      if (selected.includes(i)) return cur;
      if (!bit) return cur;
      if (selected.length) {
        for (let w = 0; w < W; w++) scratch[w] = baseNo[w] & (union[w] | bit[w]);
      } else {
        for (let w = 0; w < W; w++) scratch[w] = baseNo[w] & bit[w];
      }
      return popcount(scratch);
    };

    return {
      tags: this.index.tags.map((_, i) => tagCount(i)),
      subs: this.index.subs.map((_, i) =>
        groupCount(c.baseNoSubs, c.subMask, this.subBits[i], c.subs, i)
      ),
      rels: this.index.rels.map((_, i) =>
        groupCount(c.baseNoRels, c.relMask, this.relBits[i], c.rels, i)
      ),
    };
  }
}

function unionOf(bitsets: Bitset[], words: number): Bitset {
  const out = new Uint32Array(words);
  for (const b of bitsets) orInto(out, b);
  return out;
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
