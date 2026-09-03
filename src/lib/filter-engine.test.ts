// docs/astro-rewrite-spec.md D4 + docs/filter-redesign-spec.md D4/D7 -- bitset
// engine vs an independent naive (plain .filter) reference, over a synthetic
// index and many random states. Tag semantics: OR within a taxonomy group, AND
// across groups.
import { describe, expect, it } from 'vitest';
import {
  FilterEngine,
  emptyState,
  type FilterIndex,
  type FilterState,
  type TagGroup,
} from './filter-engine';

// --- synthetic index ---------------------------------------------------

function makeIndex(n: number, seed = 1): FilterIndex {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const tags = Array.from({ length: 12 }, (_, i) => `tag${i}`);
  const tagGroups: TagGroup[] = [
    { key: 'g0', label: 'G0', tagIds: [0, 1, 2, 3] },
    { key: 'g1', label: 'G1', tagIds: [4, 5, 6, 7] },
    { key: 'other', label: 'Everything Else', tagIds: [8, 9, 10, 11] },
  ];
  const subs = ['Alpha Studio', 'Bravo Minis', 'Charlie Forge'];
  const rels = Array.from({ length: 6 }, (_, i) => `Release ${i}`);
  const models = Array.from({ length: n }, (_, i) => {
    const nTags = Math.floor(rnd() * 4);
    const t = [...new Set(Array.from({ length: nTags }, () => Math.floor(rnd() * tags.length)))].sort(
      (a, b) => a - b
    );
    const hasRel = rnd() > 0.2;
    return {
      id: `m${i}`,
      n: `Model ${String(i).padStart(3, '0')}`,
      nl: `model ${String(i).padStart(3, '0')}`,
      t,
      s: Math.floor(rnd() * subs.length),
      r: hasRel ? Math.floor(rnd() * rels.length) : null,
      th: `m${i}.webp`,
    };
  });
  return { tags, tagGroups, subs, rels, models };
}

// --- naive reference -------------------------------------------------

function groupOf(index: FilterIndex, tagId: number): string {
  for (const g of index.tagGroups ?? []) if (g.tagIds.includes(tagId)) return g.key;
  return '__leftover__';
}

function naiveFilter(index: FilterIndex, st: FilterState): number[] {
  let rows = index.models.map((m, i) => ({ m, i }));
  if (st.subs.length) rows = rows.filter(({ m }) => st.subs.includes(m.s));
  if (st.rels.length) rows = rows.filter(({ m }) => m.r !== null && st.rels.includes(m.r));
  if (st.tags.length) {
    const byGroup = new Map<string, number[]>();
    for (const t of st.tags) {
      const k = groupOf(index, t);
      (byGroup.get(k) ?? byGroup.set(k, []).get(k)!).push(t);
    }
    for (const ids of byGroup.values()) {
      rows = rows.filter(({ m }) => ids.some((t) => m.t.includes(t))); // OR within, AND across
    }
  }
  const q = st.query.trim().toLowerCase();
  if (q) rows = rows.filter(({ m }) => m.nl.includes(q));
  const ords = rows.map(({ i }) => i);
  const nl = (i: number) => index.models[i].nl;
  const rr = (i: number) => index.models[i].r ?? Infinity;
  if (st.sort === 'name') ords.sort((a, b) => (nl(a) < nl(b) ? -1 : nl(a) > nl(b) ? 1 : 0));
  else if (st.sort === 'release')
    ords.sort((a, b) => (rr(a) !== rr(b) ? rr(a) - rr(b) : nl(a) < nl(b) ? -1 : 1));
  else ords.sort((a, b) => a - b);
  return ords;
}

function naiveFacet(index: FilterIndex, st: FilterState) {
  const size = (s: FilterState) => naiveFilter(index, s).length;
  const cur = size(st);
  const add = (g: 'tags' | 'subs' | 'rels', v: number) =>
    st[g].includes(v) ? cur : size({ ...st, [g]: [...st[g], v] });
  return {
    tags: index.tags.map((_, i) => add('tags', i)),
    subs: index.subs.map((_, i) => add('subs', i)),
    rels: index.rels.map((_, i) => add('rels', i)),
  };
}

function randomState(index: FilterIndex, rnd: () => number): FilterState {
  const pick = (len: number, p: number) =>
    Array.from({ length: len }, (_, i) => i).filter(() => rnd() < p);
  return {
    tags: pick(index.tags.length, 0.15),
    subs: pick(index.subs.length, 0.25),
    rels: pick(index.rels.length, 0.1),
    query: rnd() > 0.7 ? `model ${Math.floor(rnd() * 3)}` : '',
    sort: (['newest', 'name', 'release'] as const)[Math.floor(rnd() * 3)],
  };
}

// --- tests ----------------------------------------------------------

describe('FilterEngine vs naive reference (fuzz)', () => {
  const index = makeIndex(300, 7);
  const engine = new FilterEngine(index);
  let s = 42;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  it('filter() matches naive over 200 random states', () => {
    for (let k = 0; k < 200; k++) {
      const st = randomState(index, rnd);
      expect(engine.filter(st)).toEqual(naiveFilter(index, st));
    }
  });

  it('facetCounts() matches naive over 60 random states', () => {
    for (let k = 0; k < 60; k++) {
      const st = randomState(index, rnd);
      expect(engine.facetCounts(st)).toEqual(naiveFacet(index, st));
    }
  });
});

describe('FilterEngine basics', () => {
  // elf + undead share a group ('a'); mage is in its own group ('b').
  const index: FilterIndex = {
    tags: ['elf', 'mage', 'undead'],
    tagGroups: [
      { key: 'a', label: 'A', tagIds: [0, 2] },
      { key: 'b', label: 'B', tagIds: [1] },
    ],
    subs: ['S1', 'S2'],
    rels: ['R1', 'R2'],
    models: [
      { id: 'a', n: 'Aaa', nl: 'aaa', t: [0, 1], s: 0, r: 0, th: 'a.webp' }, // elf mage
      { id: 'b', n: 'Bbb', nl: 'bbb', t: [0], s: 0, r: 1, th: 'b.webp' }, // elf
      { id: 'c', n: 'Ccc', nl: 'ccc', t: [2], s: 1, r: null, th: 'c.webp' }, // undead
      { id: 'd', n: 'Ddd', nl: 'ddd', t: [], s: 1, r: 1, th: 'd.webp' }, // none
    ],
  };
  const engine = new FilterEngine(index);

  it('empty state returns every model, newest-first (ordinal order)', () => {
    expect(engine.filter(emptyState())).toEqual([0, 1, 2, 3]);
  });

  it('tags in the same group are OR-ed (union)', () => {
    expect(engine.filter({ ...emptyState(), tags: [0, 2] })).toEqual([0, 1, 2]); // elf OR undead
  });

  it('tags in different groups are AND-ed (intersection)', () => {
    expect(engine.filter({ ...emptyState(), tags: [0, 1] })).toEqual([0]); // elf AND mage
  });

  it('subscription filter is OR within group', () => {
    expect(engine.filter({ ...emptyState(), subs: [1] })).toEqual([2, 3]);
    expect(engine.filter({ ...emptyState(), subs: [0, 1] })).toEqual([0, 1, 2, 3]);
  });

  it('release filter excludes null-release models', () => {
    expect(engine.filter({ ...emptyState(), rels: [1] })).toEqual([1, 3]);
  });

  it('tag AND subscription intersect across groups', () => {
    expect(engine.filter({ ...emptyState(), tags: [0], subs: [0] })).toEqual([0, 1]);
  });

  it('name query is a case-insensitive substring match', () => {
    expect(engine.filter({ ...emptyState(), query: 'CC' })).toEqual([2]);
  });

  it('name sort orders by lowercased name', () => {
    expect(engine.filter({ ...emptyState(), sort: 'name' })).toEqual([0, 1, 2, 3]);
  });

  it('facet count for a new group = models remaining if that tag is also selected', () => {
    const fc = engine.facetCounts({ ...emptyState(), tags: [0] }); // elf -> {a,b}
    expect(fc.tags[1]).toBe(1); // + mage (new group) -> {a}
    expect(fc.tags[0]).toBe(2); // already selected -> current size
  });

  it('facet count within an already-selected group widens (OR)', () => {
    const fc = engine.facetCounts({ ...emptyState(), tags: [0] }); // elf, group a -> {a,b}
    expect(fc.tags[2]).toBe(3); // + undead (same group) -> elf OR undead -> {a,b,c}
  });

  it('facet count for a subscription = result size if that sub is added', () => {
    const fc = engine.facetCounts({ ...emptyState(), subs: [0] }); // {a,b}
    expect(fc.subs[1]).toBe(4); // + S2 -> all
    expect(fc.subs[0]).toBe(2); // already selected
  });

  it('handles an empty index without dividing by zero', () => {
    const e = new FilterEngine({ tags: [], subs: [], rels: [], models: [] });
    expect(e.filter(emptyState())).toEqual([]);
    expect(e.facetCounts(emptyState())).toEqual({ tags: [], subs: [], rels: [] });
  });

  it('treats tags with no declared group as one shared leftover group', () => {
    const ix: FilterIndex = {
      tags: ['x', 'y'],
      tagGroups: [], // nothing declared
      subs: ['S'],
      rels: ['R'],
      models: [
        { id: 'p', n: 'P', nl: 'p', t: [0], s: 0, r: 0, th: 'p.webp' },
        { id: 'q', n: 'Q', nl: 'q', t: [1], s: 0, r: 0, th: 'q.webp' },
      ],
    };
    // x and y OR together (same leftover group), not AND
    expect(new FilterEngine(ix).filter({ ...emptyState(), tags: [0, 1] })).toEqual([0, 1]);
  });

  it('ignores out-of-range filter ids (e.g. from a stale URL)', () => {
    expect(engine.filter({ ...emptyState(), tags: [99], subs: [42], rels: [7] })).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('release sort breaks ties on name', () => {
    const ix: FilterIndex = {
      tags: [],
      subs: ['S'],
      rels: ['R'],
      models: [
        { id: 'y', n: 'Y', nl: 'y', t: [], s: 0, r: 0, th: 'y.webp' },
        { id: 'x', n: 'X', nl: 'x', t: [], s: 0, r: 0, th: 'x.webp' },
      ],
    };
    expect(new FilterEngine(ix).filter({ ...emptyState(), sort: 'release' })).toEqual([1, 0]);
  });
});
