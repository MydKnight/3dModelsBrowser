// src/lib/grid-layout.ts
// Pure geometry for the virtualized gallery grid (docs/astro-rewrite-spec.md
// D5, build-order step 6). The island owns the DOM / ResizeObserver / scroll
// listener and calls these; @tanstack/virtual-core handles row windowing, but
// the item<->row mapping and column math are here so they're unit-testable.

export interface GridConfig {
  /** min card width in px (the grid's `minmax(<this>, 1fr)`) */
  minColWidth: number;
  /** gap between cards in px */
  gap: number;
  /** card height in px (uniform -- fixed-size row virtualization) */
  rowHeight: number;
}

/** How many columns fit in `containerWidth`. Always >= 1. */
export function columnsForWidth(containerWidth: number, cfg: GridConfig): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  const { minColWidth, gap } = cfg;
  return Math.max(1, Math.floor((containerWidth + gap) / (minColWidth + gap)));
}

/** Number of rows needed for `itemCount` items at `columns` per row. */
export function rowCount(itemCount: number, columns: number): number {
  if (itemCount <= 0 || columns <= 0) return 0;
  return Math.ceil(itemCount / columns);
}

/** Half-open [start, end) item indices for a given row. */
export function itemRange(rowIndex: number, columns: number, itemCount: number): [number, number] {
  const start = rowIndex * columns;
  return [Math.min(start, itemCount), Math.min(start + columns, itemCount)];
}

/** Total scrollable height of the grid content. */
export function contentHeight(rows: number, cfg: GridConfig): number {
  if (rows <= 0) return 0;
  return rows * cfg.rowHeight + (rows - 1) * cfg.gap;
}

/**
 * Clamp a remembered scrollTop to what's valid for the current content
 * (used when restoring position after a Back navigation -- the result list may
 * be shorter than when we left).
 */
export function clampScrollTop(saved: number, contentPx: number, viewportPx: number): number {
  const max = Math.max(0, contentPx - viewportPx);
  if (!Number.isFinite(saved) || saved < 0) return 0;
  return Math.min(saved, max);
}
