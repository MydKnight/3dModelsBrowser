import { describe, expect, it } from 'vitest';
import {
  clampScrollTop,
  columnsForWidth,
  contentHeight,
  itemRange,
  rowCount,
  type GridConfig,
} from './grid-layout';

const cfg: GridConfig = { minColWidth: 250, gap: 20, rowHeight: 300 };

describe('columnsForWidth', () => {
  it('fits whole columns accounting for the gap', () => {
    expect(columnsForWidth(250, cfg)).toBe(1);
    expect(columnsForWidth(519, cfg)).toBe(1); // 250 + 20 + 249
    expect(columnsForWidth(520, cfg)).toBe(2); // 250 + 20 + 250
    expect(columnsForWidth(1200, cfg)).toBe(4);
  });

  it('never returns less than 1', () => {
    expect(columnsForWidth(100, cfg)).toBe(1);
    expect(columnsForWidth(0, cfg)).toBe(1);
    expect(columnsForWidth(NaN, cfg)).toBe(1);
  });
});

describe('rowCount', () => {
  it('ceils items / columns', () => {
    expect(rowCount(10, 3)).toBe(4);
    expect(rowCount(9, 3)).toBe(3);
  });
  it('is 0 for no items', () => {
    expect(rowCount(0, 4)).toBe(0);
    expect(rowCount(5, 0)).toBe(0);
  });
});

describe('itemRange', () => {
  it('returns the half-open item slice for a row', () => {
    expect(itemRange(0, 3, 10)).toEqual([0, 3]);
    expect(itemRange(2, 3, 10)).toEqual([6, 9]);
    expect(itemRange(3, 3, 10)).toEqual([9, 10]); // last, partial
  });
  it('clamps a row past the end', () => {
    expect(itemRange(9, 3, 10)).toEqual([10, 10]);
  });
});

describe('contentHeight', () => {
  it('rows * rowHeight + inter-row gaps', () => {
    expect(contentHeight(1, cfg)).toBe(300);
    expect(contentHeight(3, cfg)).toBe(300 * 3 + 20 * 2);
    expect(contentHeight(0, cfg)).toBe(0);
  });
});

describe('clampScrollTop', () => {
  it('clamps to the max scroll for the current content', () => {
    expect(clampScrollTop(5000, 2000, 800)).toBe(1200);
    expect(clampScrollTop(500, 2000, 800)).toBe(500);
  });
  it('floors at 0 and rejects garbage', () => {
    expect(clampScrollTop(-10, 2000, 800)).toBe(0);
    expect(clampScrollTop(NaN, 2000, 800)).toBe(0);
    expect(clampScrollTop(100, 500, 800)).toBe(0); // content shorter than viewport
  });
});
