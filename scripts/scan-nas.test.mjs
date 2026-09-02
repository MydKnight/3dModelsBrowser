// Integration test: scanTree() against the fixture NAS tree
// (docs/nas-scan-spec.md). The fs walk is otherwise coverage-exempt; this
// proves the pieces wire together against every observed config shape.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildNasFixture } from '../tests/fixtures/build-nas-fixture.mjs';
import { scanTree } from './scan-nas.mjs';

let fixture;
let result;
const byName = (n) => result.models.find((m) => m.name === n);

beforeAll(() => {
  fixture = buildNasFixture();
  result = scanTree(fixture.root);
});
afterAll(() => fixture.cleanup());

describe('scanTree', () => {
  it('finds every model (modelMode:0 configs + config-less fallback leaves)', () => {
    expect(result.models).toHaveLength(fixture.expectedModelCount);
    expect(result.stats.models).toBe(fixture.expectedModelCount);
  });

  it('resolves a pipeline-style model: name from config, tags unioned', () => {
    const m = byName('Drakanchor');
    expect(m.subscription).toBe('Rescale'); // nearest attr "rescale miniatures" -> canonical
    expect(m.release).toBe('Molten Hearts');
    expect(m.tags).toEqual(['cr14', 'dragon', 'huge']);
    expect(m.sourceImage).toMatch(/render_01\.jpg$/); // "render" hint, alphabetically first
  });

  it('resolves a desktop-style Loot model: name from folder, no release config', () => {
    const m = byName('Sir Roland');
    expect(m.subscription).toBe('Loot Studios');
    expect(m.release).toBe('A Light in the Shadow'); // folder under subscription
    expect(m.tags).toEqual(['humanoid', 'large']);
    expect(m.sourceImage).toMatch(/FN2012AC20\.png$/);
  });

  it('resolves Witchsong: name + cover both null in config', () => {
    const m = byName('Ascendant Greatwolf');
    expect(m.subscription).toBe('Witchsong Miniatures');
    expect(m.release).toBeNull(); // model sits directly under the subscription
    expect(m.tags).toEqual(['cr9', 'huge', 'monstrosity']);
  });

  it('resolves DM Stash despite the empty root config (attrs come from the pack)', () => {
    const m = byName('Thornwhisper');
    expect(m.subscription).toBe('DM Stash');
    expect(m.release).toBe('The Fey Court');
    expect(m.sourceImage).toMatch(/preview\.png$/);
  });

  it('resolves Grinning God purely from folder structure (no configs above)', () => {
    const m = byName('Goblin Warband');
    expect(m.subscription).toBe('Grinning God');
    expect(m.release).toBe('May Release');
  });

  it('handles a config-less fallback leaf (mesh + image, no config.orynt3d)', () => {
    const m = byName('Orc Pack');
    expect(m).toBeDefined();
    expect(m.subscription).toBe('Grinning God');
    expect(m.sourceImage).toMatch(/orc\.png$/);
  });

  it('picks up a config-less leaf with STLs but NO image (real Grinning God case)', () => {
    const m = byName('Drakthul');
    expect(m).toBeDefined();
    expect(m.subscription).toBe('Grinning God');
    expect(m.sourceImage).toBeNull();
  });

  it('flags an unrecognised top-level folder as an unknown subscription', () => {
    const m = byName('Snapjaw');
    expect(m.subscription).toBe('The Trench - Crustaceans of the Deep');
    expect(result.stats.unknownSubNames.has('The Trench - Crustaceans of the Deep')).toBe(true);
  });

  it('strips the scale/support token from an Archvillain folder name when config has one', () => {
    // config has name "Nullborn Champion" so it wins; folder is
    // "Nullborn Champion_32mm_ReadyToSlice"
    const m = byName('Nullborn Champion');
    expect(m.subscription).toBe('Archvillain Games');
    expect(m.release).toBe('Children of Null');
    expect(m.sourceImage).toMatch(/hero_preview\.png$/);
  });

  it('records sourceImage:null for models with no image', () => {
    expect(byName('No Image Mob').sourceImage).toBeNull();
    expect(byName('Drakthul').sourceImage).toBeNull();
    expect(result.stats.noImage).toBe(2);
  });

  it('every model has recency timestamps and a stable id', () => {
    for (const m of result.models) {
      expect(typeof m.addedTs).toBe('number');
      expect(typeof m.firstSeenTs).toBe('number');
      expect(m.id).toMatch(/-[0-9a-f]{8}$/);
    }
  });

  it('sorts newest-first by firstSeenTs', () => {
    const prior = new Map([[byName('Drakanchor').id, { firstSeenTs: 1 }]]);
    const re = scanTree(fixture.root, prior);
    expect(re.models[re.models.length - 1].name).toBe('Drakanchor'); // oldest -> last
  });

  it('preserves firstSeenTs across a re-scan', () => {
    const drak = byName('Drakanchor');
    const prior = new Map([[drak.id, { firstSeenTs: 12345 }]]);
    const re = scanTree(fixture.root, prior);
    expect(re.models.find((m) => m.name === 'Drakanchor').firstSeenTs).toBe(12345);
  });
});
