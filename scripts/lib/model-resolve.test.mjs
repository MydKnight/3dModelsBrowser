// docs/nas-scan-spec.md -- Testing: model-resolve (pure resolution logic).
// scan-nas.mjs does the fs walk and calls these; this file is the 90% target.
import { describe, expect, it, vi } from 'vitest';
import {
  resolveName,
  resolveSubscription,
  resolveRelease,
  resolveTags,
  pickSourceImage,
  makeId,
  SUBSCRIPTION_CANON,
} from './model-resolve.mjs';

describe('resolveName', () => {
  it('uses modelmeta.name when it is a non-empty string', () => {
    expect(resolveName({ configName: 'Drakanchor', folderName: 'Drakanchor_Supports' })).toBe(
      'Drakanchor'
    );
  });

  it('trims a whitespace-padded config name', () => {
    expect(resolveName({ configName: '  Ancient Anvil  ', folderName: 'whatever' })).toBe(
      'Ancient Anvil'
    );
  });

  it('falls back to the folder name when config name is null', () => {
    expect(resolveName({ configName: null, folderName: 'Ascendant Greatwolf' })).toBe(
      'Ascendant Greatwolf'
    );
  });

  it('falls back when config name is an empty / whitespace string', () => {
    expect(resolveName({ configName: '   ', folderName: 'Noel' })).toBe('Noel');
  });

  it('strips a trailing support-type token from the folder name', () => {
    expect(resolveName({ configName: null, folderName: 'Drakanchor_Supports' })).toBe('Drakanchor');
    expect(resolveName({ configName: null, folderName: 'Noel_base_Unsupported' })).toBe('Noel base');
    expect(resolveName({ configName: null, folderName: 'Goblin_ReadyToSlice' })).toBe('Goblin');
    expect(resolveName({ configName: null, folderName: 'Orc_FDM' })).toBe('Orc');
  });

  it('strips a trailing scale token from the folder name', () => {
    expect(resolveName({ configName: null, folderName: 'Sir Roland_32mm' })).toBe('Sir Roland');
    expect(resolveName({ configName: null, folderName: 'Bust_Hero_75mm_Unsupported' })).toBe(
      'Bust Hero'
    );
  });

  it('replaces underscores and collapses whitespace', () => {
    expect(resolveName({ configName: null, folderName: 'Dwarf__Steampunk_Gatling_Walk' })).toBe(
      'Dwarf Steampunk Gatling Walk'
    );
  });

  it('keeps source casing (does not force title case)', () => {
    expect(resolveName({ configName: 'aunty gremeth', folderName: 'x' })).toBe('aunty gremeth');
  });

  it('falls back when config name is undefined (no modelmeta.name key)', () => {
    expect(resolveName({ folderName: 'Owl Bear Elder' })).toBe('Owl Bear Elder');
  });

  it('does not strip the only remaining segment even if it looks like a token', () => {
    expect(resolveName({ configName: null, folderName: 'Supports' })).toBe('Supports');
  });
});

describe('resolveSubscription', () => {
  it('prefers the nearest config subscription attribute', () => {
    const attrs = [
      { key: 'release', value: 'the fey court' },
      { key: 'subscription', value: 'dm stash' },
    ];
    expect(resolveSubscription({ attrs, firstSegment: 'DM Stash' })).toEqual({
      name: 'DM Stash',
      known: true,
    });
  });

  it('canonicalises inconsistent raw values', () => {
    expect(resolveSubscription({ attrs: [{ key: 'subscription', value: 'lootstudios' }], firstSegment: 'Loot Studios' }).name).toBe('Loot Studios');
    expect(resolveSubscription({ attrs: [{ key: 'subscription', value: 'rescale miniatures' }], firstSegment: 'Rescale' }).name).toBe('Rescale');
    expect(resolveSubscription({ attrs: [{ key: 'subscription', value: 'archvillaingames' }], firstSegment: 'Archvillain Games' }).name).toBe('Archvillain Games');
  });

  it('falls back to the first path segment when no config attr exists (canonicalised)', () => {
    expect(resolveSubscription({ attrs: [], firstSegment: 'Grinning God' })).toEqual({
      name: 'Grinning God',
      known: true,
    });
  });

  it('flags an unknown folder-fallback subscription and title-cases it', () => {
    expect(resolveSubscription({ attrs: [], firstSegment: 'Brand New Studio' })).toEqual({
      name: 'Brand New Studio',
      known: false,
    });
  });

  it('flags an unknown config subscription value', () => {
    expect(
      resolveSubscription({ attrs: [{ key: 'subscription', value: 'brand new studio' }], firstSegment: 'x' })
    ).toEqual({ name: 'Brand New Studio', known: false });
  });

  it('every canonical-table value maps to itself', () => {
    for (const canon of Object.values(SUBSCRIPTION_CANON)) {
      expect(resolveSubscription({ attrs: [{ key: 'subscription', value: canon.toLowerCase() }], firstSegment: 'x' }).name).toBe(canon);
    }
  });
});

describe('resolveRelease', () => {
  it('prefers the nearest config release attribute (title-cased)', () => {
    const attrs = [{ key: 'release', value: 'molten hearts' }];
    expect(resolveRelease({ attrs, segments: ['Rescale', 'Molten Hearts', 'enemies', 'Drakanchor_Supports'] })).toBe(
      'Molten Hearts'
    );
  });

  it('keeps an already-cased config release value', () => {
    expect(resolveRelease({ attrs: [{ key: 'release', value: 'A Light in the Shadow' }], segments: ['Loot Studios', 'x'] })).toBe(
      'A Light in the Shadow'
    );
  });

  it('title-cases an all-lowercase config value keeping small words lowercase', () => {
    expect(resolveRelease({ attrs: [{ key: 'release', value: 'children of null' }], segments: ['x', 'y'] })).toBe(
      'Children of Null'
    );
    expect(resolveRelease({ attrs: [{ key: 'release', value: 'a light in the shadow' }], segments: ['x', 'y'] })).toBe(
      'A Light in the Shadow'
    );
  });

  it('falls back to the folder directly under the subscription', () => {
    expect(
      resolveRelease({ attrs: [], segments: ['Loot Studios', 'A Light in the Shadow', 'Organized', 'bonus', 'Noel'] })
    ).toBe('A Light in the Shadow');
  });

  it('falls back for the Grinning God no-config case', () => {
    expect(resolveRelease({ attrs: [], segments: ['Grinning God', 'May Release', 'Enemies', 'Goblin'] })).toBe(
      'May Release'
    );
  });

  it('returns null when the model sits directly under the subscription with no config', () => {
    expect(resolveRelease({ attrs: [], segments: ['Witchsong Miniatures', 'Ascendant Greatwolf'] })).toBeNull();
  });

  it('returns null when segments[1] is a generic container', () => {
    expect(resolveRelease({ attrs: [], segments: ['Loot Studios', 'Organized', 'heroes', 'X'] })).toBeNull();
  });
});

describe('resolveTags', () => {
  it('unions model tags and every ancestor scancfg tag list', () => {
    const tags = resolveTags({
      tagLists: [
        ['huge', 'dragon'], // modelmeta.tags
        ['cr14'], // model scancfg.tags.include
        [], // a container ancestor
        ['boss'], // subscription-level ancestor
      ],
    });
    expect(tags).toEqual(['boss', 'cr14', 'dragon', 'huge']);
  });

  it('de-dupes case-insensitively and lowercases', () => {
    expect(resolveTags({ tagLists: [['Huge', 'huge', 'HUGE'], ['Dragon']] })).toEqual(['dragon', 'huge']);
  });

  it('drops empty / whitespace tags', () => {
    expect(resolveTags({ tagLists: [['', '  ', 'orc']] })).toEqual(['orc']);
  });

  it('returns an empty array when there are no tags', () => {
    expect(resolveTags({ tagLists: [[], []] })).toEqual([]);
  });
});

describe('pickSourceImage', () => {
  it('prefers a file whose name contains "preview" (case-insensitive)', () => {
    const images = [
      { name: 'render_01.jpg', size: 900000 },
      { name: 'Hero_Preview.png', size: 100000 },
    ];
    expect(pickSourceImage(images)).toBe('Hero_Preview.png');
  });

  it('prefers the largest png when no preview/hero hint', () => {
    const images = [
      { name: 'a.png', size: 100 },
      { name: 'b.png', size: 5000 },
      { name: 'c.jpg', size: 999999 },
    ];
    expect(pickSourceImage(images)).toBe('b.png');
  });

  it('falls back to the largest image of any type when there is no png', () => {
    const images = [
      { name: 'a.jpg', size: 100 },
      { name: 'b.jpeg', size: 5000 },
    ];
    expect(pickSourceImage(images)).toBe('b.jpeg');
  });

  it('picks the largest among multiple preview-hinted images', () => {
    const images = [
      { name: 'preview_a.png', size: 100 },
      { name: 'preview_b.png', size: 9000 },
    ];
    expect(pickSourceImage(images)).toBe('preview_b.png');
  });

  it('returns null when there are no images', () => {
    expect(pickSourceImage([])).toBeNull();
  });

  it('ignores an extensionless file', () => {
    expect(pickSourceImage([{ name: 'README', size: 10 }, { name: 'x.png', size: 5 }])).toBe('x.png');
  });

  it('ignores non-image files', () => {
    expect(pickSourceImage([{ name: 'model.stl', size: 999 }, { name: 'thumb.webp', size: 1 }])).toBe(
      'thumb.webp'
    );
  });
});

describe('makeId', () => {
  it('is a slug plus an 8-hex-char hash', () => {
    const id = makeId('Drakanchor', 'Rescale/Molten Hearts/enemies/Drakanchor_Supports');
    expect(id).toMatch(/^drakanchor-[0-9a-f]{8}$/);
  });

  it('is stable for the same (name, relPath)', () => {
    const a = makeId('Boar - Mounted Boss', 'Rescale/Cliffside Orcs/enemies/Boar');
    const b = makeId('Boar - Mounted Boss', 'Rescale/Cliffside Orcs/enemies/Boar');
    expect(a).toBe(b);
  });

  it('differs when the path differs even if the name matches', () => {
    expect(makeId('Goblin', 'a/Goblin')).not.toBe(makeId('Goblin', 'b/Goblin'));
  });

  it('slugifies non-alphanumerics', () => {
    expect(makeId("Aunty Gremeth Ever-Youth!", 'x/y')).toMatch(/^aunty-gremeth-ever-youth-[0-9a-f]{8}$/);
  });
});
