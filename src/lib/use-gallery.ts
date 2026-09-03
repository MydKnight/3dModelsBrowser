// src/lib/use-gallery.ts
// The gallery/filter island's state, decoupled from the DOM so it can be
// unit-tested (docs/astro-rewrite-spec.md, build-order step 5). Owns the
// FilterState, the FilterEngine, and URL <-> state sync. The component just
// renders `.value`s and calls the mutators.

import { batch, computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  FilterEngine,
  emptyState,
  type FacetCounts,
  type FilterIndex,
  type FilterState,
  type SortMode,
} from './filter-engine';
import { queryToState, stateToQuery } from './url-state';

export interface ActiveChip {
  kind: 'search' | 'tag' | 'sub' | 'rel';
  /** human label, e.g. `Race: Elf`, `Loot Studios`, `"drow"` */
  label: string;
  /** remove just this filter */
  remove: () => void;
}

export interface Gallery {
  index: FilterIndex;
  engine: FilterEngine;
  state: ReadonlySignal<FilterState>;
  /** result model ordinals, ordered */
  results: ReadonlySignal<number[]>;
  facets: ReadonlySignal<FacetCounts>;
  resultCount: ReadonlySignal<number>;
  isFiltered: ReadonlySignal<boolean>;
  /** one entry per active filter, for the gallery chip bar (D8) */
  activeChips: ReadonlySignal<ActiveChip[]>;
  setQuery(q: string): void;
  toggleTag(id: number): void;
  toggleSub(id: number): void;
  toggleRel(id: number): void;
  setSort(s: SortMode): void;
  clear(): void;
  /** replace the whole state from a query string (post-hydration URL sync) */
  hydrate(qs: string): void;
  /** stop the URL-sync effect (call on island teardown) */
  dispose(): void;
}

const toggle = (arr: number[], id: number): number[] =>
  arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id].sort((a, b) => a - b);

export interface GalleryOptions {
  /** initial `window.location.search` (or equivalent); parsed on creation */
  initialSearch?: string;
  /** called (debounced by the caller if desired) whenever the query string changes */
  onQueryString?: (qs: string) => void;
}

export function createGallery(index: FilterIndex, opts: GalleryOptions = {}): Gallery {
  const engine = new FilterEngine(index);
  const dict = { tags: index.tags, subs: index.subs, rels: index.rels };

  const state = signal<FilterState>(
    opts.initialSearch != null ? queryToState(opts.initialSearch, dict) : emptyState()
  );
  const patch = (p: Partial<FilterState>) => {
    state.value = { ...state.value, ...p };
  };

  const results = computed(() => engine.filter(state.value));
  const facets = computed(() => engine.facetCounts(state.value));
  const resultCount = computed(() => results.value.length);
  const isFiltered = computed(() => {
    const s = state.value;
    return s.tags.length > 0 || s.subs.length > 0 || s.rels.length > 0 || s.query.trim() !== '';
  });

  const groupLabelOfTag = new Map<number, string>();
  for (const g of index.tagGroups ?? []) {
    // the computed catch-all group has no meaningful prefix ("Everything Else: goblin")
    if (g.key === 'other') continue;
    for (const id of g.tagIds) groupLabelOfTag.set(id, g.label);
  }

  const activeChips = computed<ActiveChip[]>(() => {
    const s = state.value;
    const chips: ActiveChip[] = [];
    if (s.query.trim()) {
      chips.push({ kind: 'search', label: `"${s.query.trim()}"`, remove: () => patch({ query: '' }) });
    }
    for (const id of s.tags) {
      const g = groupLabelOfTag.get(id);
      chips.push({
        kind: 'tag',
        label: g ? `${g}: ${index.tags[id]}` : index.tags[id],
        remove: () => patch({ tags: toggle(state.value.tags, id) }),
      });
    }
    for (const id of s.subs) {
      chips.push({
        kind: 'sub',
        label: index.subs[id],
        remove: () => patch({ subs: toggle(state.value.subs, id) }),
      });
    }
    for (const id of s.rels) {
      chips.push({
        kind: 'rel',
        label: index.rels[id],
        remove: () => patch({ rels: toggle(state.value.rels, id) }),
      });
    }
    return chips;
  });

  let lastQs = stateToQuery(state.value, dict);
  const dispose = effect(() => {
    const qs = stateToQuery(state.value, dict);
    if (qs !== lastQs) {
      lastQs = qs;
      opts.onQueryString?.(qs);
    }
  });

  return {
    index,
    engine,
    state,
    results,
    facets,
    resultCount,
    isFiltered,
    activeChips,
    setQuery: (q) => patch({ query: q }),
    toggleTag: (id) => patch({ tags: toggle(state.value.tags, id) }),
    toggleSub: (id) => patch({ subs: toggle(state.value.subs, id) }),
    toggleRel: (id) => patch({ rels: toggle(state.value.rels, id) }),
    setSort: (s) => patch({ sort: s }),
    hydrate: (qs) => {
      state.value = queryToState(qs, dict);
    },
    clear: () =>
      batch(() => {
        state.value = { ...emptyState(), sort: state.value.sort };
      }),
    dispose,
  };
}
