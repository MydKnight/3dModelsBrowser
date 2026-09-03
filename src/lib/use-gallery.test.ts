import { describe, expect, it, vi } from 'vitest';
import type { FilterIndex } from './filter-engine';
import { createGallery } from './use-gallery';

const index: FilterIndex = {
  tags: ['elf', 'mage', 'undead'],
  tagGroups: [
    { key: 'race', label: 'Race', tagIds: [0, 2] },
    { key: 'class', label: 'Class', tagIds: [1] },
  ],
  subs: ['Loot Studios', 'Rescale'],
  rels: ['Molten Hearts', 'The Fey Court'],
  models: [
    { id: 'a', n: 'Aaa Elf', nl: 'aaa elf', t: [0, 1], s: 0, r: 0, th: 'a.webp' },
    { id: 'b', n: 'Bbb Elf', nl: 'bbb elf', t: [0], s: 0, r: 1, th: 'b.webp' },
    { id: 'c', n: 'Ccc Undead', nl: 'ccc undead', t: [2], s: 1, r: null, th: 'c.webp' },
    { id: 'd', n: 'Ddd', nl: 'ddd', t: [], s: 1, r: 1, th: 'd.webp' },
  ],
};
const ids = (g: ReturnType<typeof createGallery>) => g.results.value.map((o) => index.models[o].id);

describe('createGallery', () => {
  it('starts unfiltered with everything, newest-first', () => {
    const g = createGallery(index);
    expect(ids(g)).toEqual(['a', 'b', 'c', 'd']);
    expect(g.isFiltered.value).toBe(false);
    g.dispose();
  });

  it('toggleTag filters and updates facet counts', () => {
    const g = createGallery(index);
    g.toggleTag(0); // elf
    expect(ids(g)).toEqual(['a', 'b']);
    expect(g.facets.value.tags[1]).toBe(1); // + mage -> just a
    expect(g.resultCount.value).toBe(2);
    g.toggleTag(0);
    expect(g.resultCount.value).toBe(4);
    g.dispose();
  });

  it('tags in the same group OR together; across groups they AND', () => {
    const g = createGallery(index);
    g.toggleTag(0); // elf (race)
    g.toggleTag(2); // undead (race) -> elf OR undead
    expect(ids(g)).toEqual(['a', 'b', 'c']);
    g.toggleTag(1); // mage (class) -> (elf OR undead) AND mage
    expect(ids(g)).toEqual(['a']);
    g.dispose();
  });

  it('activeChips does not prefix a chip with the "other" (Everything Else) group label', () => {
    const ix: FilterIndex = {
      ...index,
      tags: ['elf', 'goblin'],
      tagGroups: [
        { key: 'race', label: 'Race', tagIds: [0] },
        { key: 'other', label: 'Everything Else', tagIds: [1] },
      ],
      models: [{ id: 'x', n: 'X', nl: 'x', t: [0, 1], s: 0, r: 0, th: 'x.webp' }],
    };
    const g = createGallery(ix);
    g.toggleTag(0);
    g.toggleTag(1);
    expect(g.activeChips.value.map((c) => c.label)).toEqual(['Race: elf', 'goblin']);
    g.dispose();
  });

  it('activeChips lists one entry per filter and each removes just itself', () => {
    const g = createGallery(index);
    g.toggleTag(0); // Race: elf
    g.toggleSub(1); // Rescale
    g.setQuery('elf');
    expect(g.activeChips.value.map((c) => c.label)).toEqual(['"elf"', 'Race: elf', 'Rescale']);
    g.activeChips.value.find((c) => c.kind === 'sub')!.remove();
    expect(g.state.value.subs).toEqual([]);
    expect(g.state.value.tags).toEqual([0]);
    g.dispose();
  });

  it('sort control reorders without changing membership', () => {
    const g = createGallery(index);
    g.setSort('name');
    expect(ids(g)).toEqual(['a', 'b', 'c', 'd']);
    g.dispose();
  });

  it('clear() resets filters but keeps the sort', () => {
    const g = createGallery(index);
    g.toggleSub(0);
    g.setSort('name');
    g.setQuery('elf');
    g.clear();
    expect(g.isFiltered.value).toBe(false);
    expect(g.state.value.sort).toBe('name');
    expect(ids(g)).toEqual(['a', 'b', 'c', 'd']);
    g.dispose();
  });

  it('hydrate() replaces state from a query string after creation', () => {
    const g = createGallery(index);
    expect(ids(g)).toEqual(['a', 'b', 'c', 'd']);
    g.hydrate('?subs=Rescale');
    expect(ids(g)).toEqual(['c', 'd']);
    g.dispose();
  });

  it('reads initial state from a query string', () => {
    const g = createGallery(index, { initialSearch: '?subs=Rescale&sort=name' });
    expect(ids(g)).toEqual(['c', 'd']);
    expect(g.state.value.sort).toBe('name');
    g.dispose();
  });

  it('emits the query string on change (for the caller to push to history)', () => {
    const onQueryString = vi.fn();
    const g = createGallery(index, { onQueryString });
    g.toggleTag(1);
    expect(onQueryString).toHaveBeenLastCalledWith('tags=mage');
    g.setQuery('drow');
    expect(onQueryString).toHaveBeenLastCalledWith('q=drow&tags=mage');
    g.dispose();
  });

  it('does not emit when the query string is unchanged', () => {
    const onQueryString = vi.fn();
    const g = createGallery(index, { onQueryString });
    g.setSort('newest'); // already newest -> serializes to same (empty) qs
    expect(onQueryString).not.toHaveBeenCalled();
    g.dispose();
  });

  it('dispose() stops further query-string emissions', () => {
    const onQueryString = vi.fn();
    const g = createGallery(index, { onQueryString });
    g.dispose();
    g.toggleTag(0);
    expect(onQueryString).not.toHaveBeenCalled();
  });
});
