// docs/astro-rewrite-spec.md -- Testing: build-filter-index (raw -> lean).
import { describe, expect, it } from 'vitest';
import { rawModels } from '../tests/fixtures/raw-models.mjs';
import { buildIndex } from './build-filter-index.mjs';

const build = (models = rawModels, opts) => buildIndex(models, { thumbnailExists: () => true, ...opts });

describe('buildIndex -- ordering', () => {
  it('sorts models newest-first by firstSeenTs, falling back to addedTs', () => {
    const { filterIndex } = build();
    expect(filterIndex.models.map((m) => m.id)).toEqual([
      'sir-roland-55aa55aa', // firstSeen 1758…
      'ascendant-greatwolf-99ff99ff', // 1757…
      'drakanchor-1a2b3c4d', // 1756…
      'goblin-warband-abcdabcd', // no firstSeen -> addedTs 1755…
    ]);
  });
});

describe('buildIndex -- dictionaries', () => {
  it('builds sorted tag/sub/rel dictionaries with no orphans', () => {
    const { filterIndex } = build();
    expect(filterIndex.tags).toEqual([
      'cr14', 'cr9', 'dragon', 'huge', 'humanoid', 'large', 'monstrosity',
    ]);
    expect(filterIndex.subs).toEqual([
      'Grinning God', 'Loot Studios', 'Rescale', 'Witchsong Miniatures',
    ]);
    expect(filterIndex.rels).toEqual([
      'A Light in the Shadow', 'May Release', 'Molten Hearts',
    ]);
  });

  it('drops a tag/rel that no surviving model references', () => {
    const models = rawModels.map((m) =>
      m.id === 'drakanchor-1a2b3c4d' ? { ...m, tags: ['huge'], release: null } : m
    );
    const { filterIndex } = build(models);
    expect(filterIndex.tags).not.toContain('cr14');
    expect(filterIndex.tags).not.toContain('dragon');
    expect(filterIndex.rels).not.toContain('Molten Hearts');
  });
});

describe('buildIndex -- per-model record', () => {
  it('encodes tags/sub/rel as sorted dictionary ids; null release stays null', () => {
    const { filterIndex } = build();
    const wolf = filterIndex.models.find((m) => m.id === 'ascendant-greatwolf-99ff99ff');
    expect(wolf.n).toBe('Ascendant Greatwolf');
    expect(wolf.nl).toBe('ascendant greatwolf');
    expect(wolf.s).toBe(filterIndex.subs.indexOf('Witchsong Miniatures'));
    expect(wolf.r).toBeNull();
    expect(wolf.t).toEqual(
      ['cr9', 'huge', 'monstrosity'].map((t) => filterIndex.tags.indexOf(t)).sort((a, b) => a - b)
    );
    expect(wolf.th).toBe('ascendant-greatwolf-99ff99ff.webp');
  });

  it('an untagged model gets an empty tag id array', () => {
    const { filterIndex } = build();
    const goblin = filterIndex.models.find((m) => m.id === 'goblin-warband-abcdabcd');
    expect(goblin.t).toEqual([]);
    expect(goblin.r).toBe(filterIndex.rels.indexOf('May Release'));
  });
});

describe('buildIndex -- details.json', () => {
  it('keyed by id, display fields only, dateAdded from firstSeenTs', () => {
    const { details } = build();
    expect(details['drakanchor-1a2b3c4d']).toEqual({
      name: 'Drakanchor',
      tags: ['huge', 'dragon', 'cr14'],
      subscription: 'Rescale',
      release: 'Molten Hearts',
      relPath: 'Rescale/Molten Hearts/enemies/Drakanchor_Supports',
      dateAdded: new Date(1756000000000).toISOString(),
    });
  });

  it('every filter-index model has a details entry', () => {
    const { filterIndex, details } = build();
    for (const m of filterIndex.models) expect(details[m.id]).toBeDefined();
  });

  it('a model with neither firstSeenTs nor addedTs sorts last and dates to epoch', () => {
    const models = [
      { id: 'no-ts-1', name: 'No TS', subscription: 'Rescale', tags: [], relPath: 'x' },
      rawModels[0],
    ];
    const { filterIndex, details } = build(models);
    expect(filterIndex.models[filterIndex.models.length - 1].id).toBe('no-ts-1');
    expect(details['no-ts-1'].dateAdded).toBe(new Date(0).toISOString());
  });
});

describe('buildIndex -- validation', () => {
  it('throws on a model with no id', () => {
    expect(() => build([{ name: 'x', subscription: 'Rescale', tags: [], addedTs: 1 }])).toThrow(/id/i);
  });

  it('throws on a duplicate id', () => {
    const dup = [rawModels[0], { ...rawModels[1], id: rawModels[0].id }];
    expect(() => build(dup)).toThrow(/duplicate/i);
  });

  it('throws loudly when a thumbnail is missing (default)', () => {
    expect(() => build(rawModels, { thumbnailExists: (id) => id !== 'drakanchor-1a2b3c4d' })).toThrow(
      /thumbnail/i
    );
  });

  it('skips the thumbnail check when told to', () => {
    expect(() =>
      buildIndex(rawModels, { thumbnailExists: () => false, skipThumbCheck: true })
    ).not.toThrow();
  });

  it('works with default options (thumbnailExists defaults to always-true)', () => {
    expect(() => buildIndex(rawModels)).not.toThrow();
    expect(buildIndex(rawModels).filterIndex.models).toHaveLength(rawModels.length);
  });
});
