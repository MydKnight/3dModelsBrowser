import { describe, expect, it } from 'vitest';
import type { FilterIndex } from './filter-engine';
import { detailPaths, type DetailEntry } from './detail-paths';

const index: FilterIndex = {
  tags: [],
  subs: ['S'],
  rels: [],
  models: [
    { id: 'new', n: 'New', nl: 'new', t: [], s: 0, r: null, th: 'new.webp' },
    { id: 'mid', n: 'Mid', nl: 'mid', t: [], s: 0, r: null, th: 'mid.webp' },
    { id: 'old', n: 'Old', nl: 'old', t: [], s: 0, r: null, th: 'old.webp' },
  ],
};
const entry = (name: string): DetailEntry => ({
  name,
  tags: [],
  subscription: 'S',
  release: null,
  relPath: `x/${name}`,
  dateAdded: '2026-01-01T00:00:00.000Z',
});
const details = { new: entry('New'), mid: entry('Mid'), old: entry('Old') };

describe('detailPaths', () => {
  it('emits one path per model in filter-index (newest-first) order', () => {
    const paths = detailPaths(index, details);
    expect(paths.map((p) => p.params.id)).toEqual(['new', 'mid', 'old']);
  });

  it('wires newest-first prev/next neighbours', () => {
    const [a, b, c] = detailPaths(index, details);
    expect([a.props.prevId, a.props.nextId]).toEqual([null, 'mid']);
    expect([b.props.prevId, b.props.nextId]).toEqual(['new', 'old']);
    expect([c.props.prevId, c.props.nextId]).toEqual(['mid', null]);
  });

  it('passes the details entry through as a prop', () => {
    expect(detailPaths(index, details)[1].props.entry.name).toBe('Mid');
  });

  it('throws loudly when a filter-index id is missing from details', () => {
    const partial = { new: entry('New'), old: entry('Old') };
    expect(() => detailPaths(index, partial)).toThrow(/details\.json entry/);
    expect(() => detailPaths(index, partial)).toThrow(/mid/);
  });
});
