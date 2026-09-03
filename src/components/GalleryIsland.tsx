/** @jsxImportSource preact */
// src/components/GalleryIsland.tsx
// The single client:load island (docs/astro-rewrite-spec.md D1, redesigned by
// docs/filter-redesign-spec.md). Gallery top bar (search + sort + Filters
// button + active-filter chips) + a slide-in overlay drawer holding the faceted
// filters + a windowed results grid. State/engine/URL-sync live in
// ../lib/use-gallery; grid geometry in ../lib/grid-layout (both unit-tested).

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
import { createGallery, type Gallery } from '../lib/use-gallery';

const GRID: GridConfig = { minColWidth: 240, gap: 16, rowHeight: 288 };
const OVERSCAN_ROWS = 3;
const FILTERABLE_THRESHOLD = 12; // show a filter box in a group with more than this many values

export interface GalleryIslandProps {
  index: FilterIndex;
  /** injectable for tests; defaults to real history + location */
  history?: Pick<History, 'replaceState'>;
  initialSearch?: string;
}

export default function GalleryIsland({ index, history, initialSearch }: GalleryIslandProps) {
  const hist = history ?? (typeof window !== 'undefined' ? window.history : undefined);

  const gallery = useMemo(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    return createGallery(index, {
      // Start from an explicitly-passed search (tests) or empty. The real
      // window.location.search is applied in an effect below so the first
      // client render matches the SSR'd HTML (no hydration mismatch).
      initialSearch: initialSearch ?? '',
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

  // Apply the live URL after hydration (only when the host didn't pass one).
  useEffect(() => {
    if (initialSearch == null && typeof window !== 'undefined' && window.location.search) {
      gallery.hydrate(window.location.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const viewportH = useSignal(1200);
  const containerW = useSignal(1024);
  const scrollTop = useSignal(0);
  const drawerOpen = useSignal(false);

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
  const state = gallery.state;

  const columns = useComputed(() => columnsForWidth(containerW.value, GRID));
  const rows = useComputed(() => rowCount(results.value.length, columns.value));
  const totalH = useComputed(() => contentHeight(rows.value, GRID));
  const activeFacetCount = useComputed(() => {
    const s = state.value;
    return s.tags.length + s.subs.length + s.rels.length;
  });

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

  const closeDrawer = () => {
    drawerOpen.value = false;
    filtersBtnRef.current?.focus();
  };

  return (
    <div class="gallery">
      <div class="topbar">
        <input
          type="search"
          class="topbar-search"
          placeholder="Search by name"
          value={state.value.query}
          onInput={(e) => gallery.setQuery((e.target as HTMLInputElement).value)}
          aria-label="Search by name"
        />
        <label class="topbar-sort">
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
        <button
          type="button"
          class="filters-btn"
          ref={filtersBtnRef}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen.value}
          onClick={() => (drawerOpen.value = true)}
        >
          Filters
          {activeFacetCount.value > 0 && <span class="badge">{activeFacetCount.value}</span>}
        </button>
      </div>

      <ChipBar gallery={gallery} />

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

      <FilterDrawer
        open={drawerOpen.value}
        onClose={closeDrawer}
        gallery={gallery}
        index={index}
      />
    </div>
  );
}

function ChipBar({ gallery }: { gallery: Gallery }) {
  const chips = gallery.activeChips.value;
  if (!chips.length) return null;
  return (
    <div class="chip-bar" role="region" aria-label="Active filters">
      {chips.map((c, i) => (
        <button
          key={`${c.kind}-${i}`}
          type="button"
          class="chip"
          aria-label={`Remove ${c.label}`}
          onClick={c.remove}
        >
          {c.label} <span aria-hidden="true">×</span>
        </button>
      ))}
      <button type="button" class="chip chip-clear" onClick={() => gallery.clear()}>
        Clear all
      </button>
    </div>
  );
}

function FilterDrawer({
  open,
  onClose,
  gallery,
  index,
}: {
  open: boolean;
  onClose: () => void;
  gallery: Gallery;
  index: FilterIndex;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const state = gallery.state;
  const facets = gallery.facets;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const f = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select,summary,[tabindex]:not([tabindex="-1"])'
    );
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div class={`drawer-root${open ? ' open' : ''}`} hidden={!open}>
      <div class="drawer-backdrop" onClick={onClose} />
      <aside
        class="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header class="drawer-head">
          <h2>Filters</h2>
          <button type="button" class="drawer-close" aria-label="Close filters" onClick={onClose}>
            ×
          </button>
        </header>

        <div class="drawer-body">
          <fieldset class="subs">
            <legend>Subscription</legend>
            {index.subs.map((v, i) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={state.value.subs.includes(i)}
                  onChange={() => gallery.toggleSub(i)}
                />
                {v} <span class="count">{facets.value.subs[i]}</span>
              </label>
            ))}
          </fieldset>

          <GroupDropdown
            label="Release"
            values={index.rels}
            selected={index.rels.map((_, i) => state.value.rels.includes(i))}
            counts={facets.value.rels}
            onToggle={gallery.toggleRel}
            filterable
          />

          {(index.tagGroups ?? []).map((g) => (
            <GroupDropdown
              key={g.key}
              label={g.label}
              values={g.tagIds.map((id) => index.tags[id])}
              selected={g.tagIds.map((id) => state.value.tags.includes(id))}
              counts={g.tagIds.map((id) => facets.value.tags[id])}
              onToggle={(local) => gallery.toggleTag(g.tagIds[local])}
              filterable={g.tagIds.length > FILTERABLE_THRESHOLD}
            />
          ))}
        </div>

        <footer class="drawer-foot">
          {gallery.isFiltered.value && (
            <button type="button" onClick={() => gallery.clear()}>
              Clear all filters
            </button>
          )}
          <button type="button" class="primary" onClick={onClose}>
            Show {gallery.resultCount.value} models
          </button>
        </footer>
      </aside>
    </div>
  );
}

function GroupDropdown({
  label,
  values,
  selected,
  counts,
  onToggle,
  filterable = false,
}: {
  label: string;
  values: string[];
  selected: boolean[];
  counts: number[];
  onToggle: (localIndex: number) => void;
  filterable?: boolean;
}) {
  const q = useSignal('');
  const shown = useComputed(() => {
    const needle = q.value.trim().toLowerCase();
    return values
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => !needle || v.toLowerCase().includes(needle));
  });
  if (!values.length) return null;
  const selectedCount = selected.filter(Boolean).length;

  return (
    <details class="group-dropdown">
      <summary>
        <span class="group-label">{label}</span>
        {selectedCount > 0 && <span class="badge">{selectedCount}</span>}
      </summary>
      <div class="group-body">
        {filterable && (
          <input
            type="search"
            class="group-filter"
            placeholder={`Filter ${label.toLowerCase()}`}
            aria-label={`Filter ${label}`}
            value={q.value}
            onInput={(e) => (q.value = (e.target as HTMLInputElement).value)}
          />
        )}
        <div class="group-options">
          {shown.value.map(({ v, i }) => (
            <label key={v}>
              <input
                type="checkbox"
                checked={selected[i]}
                disabled={!selected[i] && counts[i] === 0}
                onChange={() => onToggle(i)}
              />
              {v} <span class="count">{counts[i]}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function Card({ id, name, thumb }: { id: string; name: string; thumb: string }) {
  return (
    <a class="card" href={`/m/${id}`}>
      <img
        src={`/thumbnails/${thumb}`}
        alt={name}
        loading="lazy"
        decoding="async"
        width="240"
        height="240"
      />
      <span class="card-name">{name}</span>
    </a>
  );
}
