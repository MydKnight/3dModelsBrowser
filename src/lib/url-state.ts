// src/lib/url-state.ts
// FilterState <-> query string (docs/astro-rewrite-spec.md D8). Tags/subs/rels
// serialize as their string *values*, not dictionary ids, so a shared URL keeps
// working after a data refresh reassigns ids. Unknown values are dropped.

import type { FilterState, SortMode } from './filter-engine';
import { emptyState } from './filter-engine';

interface Dictionaries {
  tags: string[];
  subs: string[];
  rels: string[];
}

const SORTS: SortMode[] = ['newest', 'name', 'release'];

function idsToValues(ids: number[], dict: string[]): string[] {
  return ids.map((i) => dict[i]).filter((v): v is string => v != null);
}
function valuesToIds(values: string[], dict: string[]): number[] {
  return values
    .map((v) => dict.indexOf(v))
    .filter((i) => i !== -1)
    .sort((a, b) => a - b);
}

/** Serialize to a query string (no leading `?`). Stable key order. */
export function stateToQuery(state: FilterState, dict: Dictionaries): string {
  const p = new URLSearchParams();
  if (state.query.trim()) p.set('q', state.query.trim());
  const tags = idsToValues(state.tags, dict.tags);
  const subs = idsToValues(state.subs, dict.subs);
  const rels = idsToValues(state.rels, dict.rels);
  if (tags.length) p.set('tags', tags.join(','));
  if (subs.length) p.set('subs', subs.join(','));
  if (rels.length) p.set('rels', rels.join(','));
  if (state.sort !== 'newest') p.set('sort', state.sort);
  return p.toString();
}

/** Parse a query string (with or without leading `?`) back to a FilterState. */
export function queryToState(qs: string, dict: Dictionaries): FilterState {
  const p = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs);
  const split = (key: string) =>
    (p.get(key) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const sortParam = p.get('sort') as SortMode | null;

  return {
    ...emptyState(),
    query: p.get('q') ?? '',
    tags: valuesToIds(split('tags'), dict.tags),
    subs: valuesToIds(split('subs'), dict.subs),
    rels: valuesToIds(split('rels'), dict.rels),
    sort: sortParam && SORTS.includes(sortParam) ? sortParam : 'newest',
  };
}
