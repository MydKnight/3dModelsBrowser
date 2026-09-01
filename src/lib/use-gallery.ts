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
  type TagMode,
} from './filter-engine';
import { queryToState, stateToQuery } from './url-state';

export interface Gallery {
  index: FilterIndex;
  engine: FilterEngine;
  state: ReadonlySignal<FilterState>;
  /** result model ordinals, ordered */
  results: ReadonlySignal<number[]>;
  facets: ReadonlySignal<FacetCounts>;
  resultCount: ReadonlySignal<number>;
  isFiltered: ReadonlySignal<boolean>;
  setQuery(q: string): void;
  toggleTag(id: number): void;
  setTagMode(m: TagMode): void;
  toggleSub(id: number): void;
  toggleRel(id: number): void;
  setSort(s: SortMode): void;
  clear(): void;
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

  const results = computed(() => engine.filter(state.value));
  const facets = computed(() => engine.facetCounts(state.value));
  const resultCount = computed(() => results.value.length);
  const isFiltered = computed(() => {
    const s = state.value;
    return s.tags.length > 0 || s.subs.length > 0 || s.rels.length > 0 || s.query.trim() !== '';
  });

  let lastQs = stateToQuery(state.value, dict);
  const dispose = effect(() => {
    const qs = stateToQuery(state.value, dict);
    if (qs !== lastQs) {
      lastQs = qs;
      opts.onQueryString?.(qs);
    }
  });

  const patch = (p: Partial<FilterState>) => {
    state.value = { ...state.value, ...p };
  };

  return {
    index,
    engine,
    state,
    results,
    facets,
    resultCount,
    isFiltered,
    setQuery: (q) => patch({ query: q }),
    toggleTag: (id) => patch({ tags: toggle(state.value.tags, id) }),
    setTagMode: (m) => patch({ tagMode: m }),
    toggleSub: (id) => patch({ subs: toggle(state.value.subs, id) }),
    toggleRel: (id) => patch({ rels: toggle(state.value.rels, id) }),
    setSort: (s) => patch({ sort: s }),
    clear: () =>
      batch(() => {
        state.value = { ...emptyState(), sort: state.value.sort };
      }),
    dispose,
  };
}
