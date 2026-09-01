// src/lib/detail-paths.ts
// getStaticPaths logic for src/pages/m/[id].astro (docs/astro-rewrite-spec.md
// D3, build-order step 7). Kept out of the .astro file so it's unit-testable.

import type { FilterIndex } from './filter-engine';

export interface DetailEntry {
  name: string;
  tags: string[];
  subscription: string;
  release: string | null;
  relPath: string;
  dateAdded: string;
}

export interface DetailPageProps {
  id: string;
  entry: DetailEntry;
  /** newest-first neighbours (filter-agnostic) for arrow-key / prev-next nav */
  prevId: string | null;
  nextId: string | null;
}

/**
 * One entry per model, in filter-index order (newest first). Throws loudly if
 * any filter-index id is missing from `details` -- that means the two snapshot
 * files are out of sync and the build must not ship.
 */
export function detailPaths(
  index: FilterIndex,
  details: Record<string, DetailEntry>
): { params: { id: string }; props: DetailPageProps }[] {
  const missing = index.models.filter((m) => !details[m.id]);
  if (missing.length) {
    const sample = missing.slice(0, 5).map((m) => m.id).join(', ');
    throw new Error(
      `detailPaths: ${missing.length} filter-index id(s) have no details.json entry ` +
        `(${sample}${missing.length > 5 ? ', ...' : ''}). Regenerate the snapshot.`
    );
  }

  const ids = index.models.map((m) => m.id);
  return ids.map((id, i) => ({
    params: { id },
    props: {
      id,
      entry: details[id],
      prevId: i > 0 ? ids[i - 1] : null,
      nextId: i < ids.length - 1 ? ids[i + 1] : null,
    },
  }));
}
