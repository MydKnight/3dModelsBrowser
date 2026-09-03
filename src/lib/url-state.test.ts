import { describe, expect, it } from 'vitest';
import { emptyState } from './filter-engine';
import { queryToState, stateToQuery } from './url-state';

const dict = {
  tags: ['dragon', 'elf', 'mage', 'undead'],
  subs: ['Loot Studios', 'Rescale'],
  rels: ['Molten Hearts', 'The Fey Court'],
};

describe('stateToQuery', () => {
  it('empty state -> empty string', () => {
    expect(stateToQuery(emptyState(), dict)).toBe('');
  });

  it('serializes values (not ids), sorted-stable', () => {
    const q = stateToQuery(
      { ...emptyState(), tags: [1, 2], subs: [0], query: 'drow', sort: 'name' },
      dict
    );
    expect(q).toBe('q=drow&tags=elf%2Cmage&subs=Loot+Studios&sort=name');
  });

  it('omits sort when newest', () => {
    expect(stateToQuery({ ...emptyState(), sort: 'newest' }, dict)).toBe('');
  });
});

describe('queryToState', () => {
  it('round-trips a full state', () => {
    const state = { ...emptyState(), tags: [1, 2], subs: [1], rels: [0], query: 'x', sort: 'release' as const };
    expect(queryToState(stateToQuery(state, dict), dict)).toEqual(state);
  });

  it('ignores a legacy tagmode= param without error', () => {
    expect(() => queryToState('tags=elf&tagmode=or', dict)).not.toThrow();
    expect(queryToState('tags=elf&tagmode=or', dict).tags).toEqual([1]);
  });

  it('tolerates a leading ?', () => {
    expect(queryToState('?q=hi', dict).query).toBe('hi');
  });

  it('drops unknown tag/sub/rel values (stale link after a data refresh)', () => {
    const s = queryToState('tags=elf,gnome,mage&subs=Nonesuch&rels=Molten Hearts', dict);
    expect(s.tags).toEqual([1, 2]);
    expect(s.subs).toEqual([]);
    expect(s.rels).toEqual([0]);
  });

  it('falls back to newest for an unknown sort', () => {
    expect(queryToState('sort=bogus', dict).sort).toBe('newest');
  });
});
