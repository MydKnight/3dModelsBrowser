/** @jsxImportSource preact */
// src/components/GalleryIsland.tsx
// The single client:load island (docs/astro-rewrite-spec.md D1). Filter panel +
// windowed results grid. State/engine/URL-sync live in ../lib/use-gallery;
// grid geometry in ../lib/grid-layout (both unit-tested). Windowing is
// hand-rolled over grid-layout rather than @tanstack/virtual -- uniform-height
// rows make it a few lines, and the math is already covered by tests.

import { useComputed, useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { FilterIndex } from '../lib/filter-engine';
import {
  clampScrollTop,
  columnsForWidth,
  contentHeight,
  itemRange,
  rowCount,
  type GridConfig,
} from '../lib/grid-layout';
import { createGallery } from '../lib/use-gallery';

const GRID: GridConfig = { minColWidth: 240, gap: 16, rowHeight: 288 };
const OVERSCAN_ROWS = 3;

export interface GalleryIslandProps {
  index: FilterIndex;
  /** injectable for tests; defaults to real history + location */
  history?: Pick<History, 'replaceState'>;
  initialSearch?: string;
}

export default function GalleryIsland({ index, history, initialSearch }: GalleryIslandProps) {
  const hist = history ?? (typeof window !== 'undefined' ? window.history : undefined);
  const search =
    initialSearch ?? (typeof window !== 'undefined' ? window.location.search : '');

  const gallery = useMemo(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    return createGallery(index, {
      initialSearch: search,
      onQueryString: (qs) => {
        if (!hist) return;
        clearTimeout(t);
        t = setTimeout(() => {
          const url = qs ? `?${qs}` : location.pathname;
          hist.replaceState(null, '', url);
        }, 200);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  useEffect(() => () => gallery.dispose(), [gallery]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportH = useSignal(1200);
  const containerW = useSignal(1024);
  const scrollTop = useSignal(0);

  // measure
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      viewportH.value = el.clientHeight || viewportH.value;
      containerW.value = el.clientWidth || containerW.value;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const results = gallery.results;
  const facets = gallery.facets;
  const state = gallery.state;

  const columns = useComputed(() => columnsForWidth(containerW.value, GRID));
  const rows = useComputed(() => rowCount(results.value.length, columns.value));
  const totalH = useComputed(() => contentHeight(rows.value, GRID));

  // restore scroll position saved before a detail-page navigation
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = Number(sessionStorage.getItem('gallery-scroll') ?? 0);
    el.scrollTop = clampScrollTop(saved, totalH.value, viewportH.value);
    scrollTop.value = el.scrollTop;
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    scrollTop.value = el.scrollTop;
    try {
      sessionStorage.setItem('gallery-scroll', String(el.scrollTop));
    } catch {
      /* private mode */
    }
  };

  const visibleRows = useComputed(() => {
    const rh = GRID.rowHeight + GRID.gap;
    const first = Math.max(0, Math.floor(scrollTop.value / rh) - OVERSCAN_ROWS);
    const last = Math.min(
      rows.value,
      Math.ceil((scrollTop.value + viewportH.value) / rh) + OVERSCAN_ROWS
    );
    const out: number[] = [];
    for (let r = first; r < last; r++) out.push(r);
    return out;
  });

  return (
    <div class="gallery">
      <aside class="filters">
        <input
          type="search"
          placeholder="Search by name"
          value={state.value.query}
          onInput={(e) => gallery.setQuery((e.target as HTMLInputElement).value)}
          aria-label="Search by name"
        />

        <label>
          Sort
          <select
            value={state.value.sort}
            onChange={(e) => gallery.setSort((e.target as HTMLSelectElement).value as any)}
          >
            <option value="newest">Newest</option>
            <option value="name">Name</option>
            <option value="release">Release</option>
          </select>
        </label>

        {gallery.isFiltered.value && (
          <button type="button" onClick={() => gallery.clear()}>
            Clear all filters
          </button>
        )}

        <FacetGroup
          legend="Subscription"
          values={index.subs}
          selected={state.value.subs}
          counts={facets.value.subs}
          onToggle={gallery.toggleSub}
        />
        <FacetGroup
          legend="Release"
          values={index.rels}
          selected={state.value.rels}
          counts={facets.value.rels}
          onToggle={gallery.toggleRel}
        />

        <fieldset class="tags">
          <legend>
            Tags
            <span class="mode-toggle">
              {(['AND', 'OR'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={state.value.tagMode === m}
                  onClick={() => gallery.setTagMode(m)}
                >
                  {m}
                </button>
              ))}
            </span>
          </legend>
          <div class="tag-cloud">
            {index.tags.map((tag, i) => {
              const count = facets.value.tags[i];
              const on = state.value.tags.includes(i);
              return (
                <button
                  key={tag}
                  type="button"
                  class="tag"
                  aria-pressed={on}
                  disabled={!on && count === 0}
                  onClick={() => gallery.toggleTag(i)}
                >
                  {tag} <span class="count">{count}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </aside>

      <main class="results">
        <p class="result-count" role="status">
          {results.value.length} of {index.models.length} models
        </p>
        <div class="scroller" ref={scrollRef} onScroll={onScroll}>
          {results.value.length === 0 ? (
            <p class="empty">No models match these filters.</p>
          ) : (
            <div class="grid-canvas" style={{ height: totalH.value, position: 'relative' }}>
              {visibleRows.value.map((row) => {
                const [start, end] = itemRange(row, columns.value, results.value.length);
                return (
                  <div
                    key={row}
                    class="grid-row"
                    style={{
                      position: 'absolute',
                      top: row * (GRID.rowHeight + GRID.gap),
                      left: 0,
                      right: 0,
                      height: GRID.rowHeight,
                      display: 'grid',
                      gap: GRID.gap,
                      gridTemplateColumns: `repeat(${columns.value}, 1fr)`,
                    }}
                  >
                    {results.value.slice(start, end).map((ord) => {
                      const m = index.models[ord];
                      return <Card key={m.id} id={m.id} name={m.n} thumb={m.th} />;
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function FacetGroup({
  legend,
  values,
  selected,
  counts,
  onToggle,
}: {
  legend: string;
  values: string[];
  selected: number[];
  counts: number[];
  onToggle: (id: number) => void;
}) {
  if (values.length === 0) return null;
  return (
    <fieldset>
      <legend>{legend}</legend>
      {values.map((v, i) => (
        <label key={v}>
          <input
            type="checkbox"
            checked={selected.includes(i)}
            onChange={() => onToggle(i)}
          />
          {v} <span class="count">{counts[i]}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Card({ id, name, thumb }: { id: string; name: string; thumb: string }) {
  return (
    <a class="card" href={`/m/${id}`}>
      <img src={`/thumbnails/${thumb}`} alt={name} loading="lazy" decoding="async" width="240" height="240" />
      <span class="card-name">{name}</span>
    </a>
  );
}
