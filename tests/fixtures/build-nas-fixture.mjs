// tests/fixtures/build-nas-fixture.mjs
// Builds a miniature NAS tree in a temp dir covering the config.orynt3d shape
// variation documented in docs/nas-scan-spec.md. Used by scan-nas integration
// tests -- built fresh each run, so no stale committed fixture files.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function cfg(obj) {
  return JSON.stringify({ version: 5, ...obj });
}
function container(attrs = []) {
  return cfg({
    scancfg: {
      modelMode: 2,
      tags: { include: [], exclude: [], clear: false },
      attributes: { include: attrs, exclude: [], clear: false },
    },
    modelmeta: { name: null, notes: '', tags: [], cover: null, collections: [], attributes: [] },
  });
}
function model({ name = null, cover = null, metaTags = [], scanTags = [] } = {}) {
  return cfg({
    scancfg: {
      modelMode: 0,
      tags: { include: scanTags, exclude: [], clear: false },
      attributes: { include: [], exclude: [], clear: false },
    },
    modelmeta: { name, notes: '', tags: metaTags, cover, collections: [], attributes: [] },
  });
}

/**
 * @returns {{ root: string, cleanup: () => void, expected: Record<string, object> }}
 */
export function buildNasFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-fixture-'));
  const w = (relParts, content) => {
    const p = path.join(root, ...relParts);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  const img = (relParts, bytes) => w(relParts, Buffer.alloc(bytes, 1));

  // --- Loot Studios: sub attr at root, no release config, name null, deep nesting
  w(['Loot Studios', 'config.orynt3d'], container([{ key: 'subscription', value: 'lootstudios' }]));
  w(['Loot Studios', 'A Light in the Shadow', 'Organized', 'config.orynt3d'], container());
  w(['Loot Studios', 'A Light in the Shadow', 'Organized', 'heroes', 'config.orynt3d'], container());
  w(
    ['Loot Studios', 'A Light in the Shadow', 'Organized', 'heroes', 'Sir Roland', 'config.orynt3d'],
    model({ name: null, cover: 'a1b2c3d4.png', scanTags: ['large', 'humanoid'] })
  );
  img(['Loot Studios', 'A Light in the Shadow', 'Organized', 'heroes', 'Sir Roland', 'FN2012AC20.png'], 5000);
  w(['Loot Studios', 'A Light in the Shadow', 'Organized', 'heroes', 'Sir Roland', 'Sir_Roland.stl'], 'x');

  // --- Rescale: name string, pack config with subscription + release
  w(['Rescale', 'config.orynt3d'], container([{ key: 'subscription', value: 'rescale' }]));
  w(
    ['Rescale', 'Molten Hearts', 'config.orynt3d'],
    container([
      { key: 'subscription', value: 'rescale miniatures' },
      { key: 'release', value: 'molten hearts' },
    ])
  );
  w(
    ['Rescale', 'Molten Hearts', 'enemies', 'Drakanchor_Supports', 'config.orynt3d'],
    model({ name: 'Drakanchor', metaTags: ['huge', 'dragon'], scanTags: ['cr14'] })
  );
  img(['Rescale', 'Molten Hearts', 'enemies', 'Drakanchor_Supports', 'render_01.jpg'], 3000);
  img(['Rescale', 'Molten Hearts', 'enemies', 'Drakanchor_Supports', 'render_02.jpg'], 8000);
  w(['Rescale', 'Molten Hearts', 'enemies', 'Drakanchor_Supports', 'Drakanchor_Body.stl'], 'x');

  // --- Witchsong: name null AND cover null, model directly under subscription
  w(
    ['Witchsong Miniatures', 'config.orynt3d'],
    container([{ key: 'subscription', value: 'witchsong miniatures' }])
  );
  w(
    ['Witchsong Miniatures', 'Ascendant Greatwolf', 'config.orynt3d'],
    model({ name: null, cover: null, scanTags: ['huge', 'monstrosity', 'cr9'] })
  );
  img(['Witchsong Miniatures', 'Ascendant Greatwolf', 'Ascendant Greatwolf.png'], 4000);
  w(['Witchsong Miniatures', 'Ascendant Greatwolf', 'Torso.stl'], 'x');

  // --- DM Stash: root config exists but EMPTY attrs; pack config carries both
  w(['DM Stash', 'config.orynt3d'], container([]));
  w(
    ['DM Stash', 'The Fey Court', 'config.orynt3d'],
    container([
      { key: 'subscription', value: 'dm stash' },
      { key: 'release', value: 'the fey court' },
    ])
  );
  w(
    ['DM Stash', 'The Fey Court', 'npcs', 'Thornwhisper_Unsupported', 'config.orynt3d'],
    model({ name: null })
  );
  img(['DM Stash', 'The Fey Court', 'npcs', 'Thornwhisper_Unsupported', 'preview.png'], 2000);
  w(['DM Stash', 'The Fey Court', 'npcs', 'Thornwhisper_Unsupported', 'Thornwhisper.stl'], 'x');

  // --- Grinning God: NO config anywhere above the model
  w(['Grinning God', 'May Release', 'Enemies', 'Goblin Warband', 'config.orynt3d'], model({ name: null }));
  img(['Grinning God', 'May Release', 'Enemies', 'Goblin Warband', 'goblin.jpg'], 1500);
  w(['Grinning God', 'May Release', 'Enemies', 'Goblin Warband', 'goblin.stl'], 'x');

  // --- Archvillain: version 6, pack release without subscription attr, name string
  w(
    ['Archvillain Games', 'config.orynt3d'],
    container([{ key: 'subscription', value: 'archvillaingames' }])
  );
  w(
    ['Archvillain Games', 'Children of Null', 'config.orynt3d'],
    container([{ key: 'release', value: 'children of null' }])
  );
  w(
    ['Archvillain Games', 'Children of Null', 'heroes', 'Nullborn Champion_32mm_ReadyToSlice', 'config.orynt3d'],
    model({ name: 'Nullborn Champion' })
  );
  img(['Archvillain Games', 'Children of Null', 'heroes', 'Nullborn Champion_32mm_ReadyToSlice', 'hero_preview.png'], 6000);
  w(['Archvillain Games', 'Children of Null', 'heroes', 'Nullborn Champion_32mm_ReadyToSlice', 'champion.stl'], 'x');

  // --- Edge: model config present but NO image at all
  w(
    ['Rescale', 'Molten Hearts', 'enemies', 'NoImage_Supports', 'config.orynt3d'],
    model({ name: 'No Image Mob' })
  );
  w(['Rescale', 'Molten Hearts', 'enemies', 'NoImage_Supports', 'mob.stl'], 'x');

  // --- Edge: NO config at all, but a leaf with mesh + image (fallback detection)
  img(['Grinning God', 'May Release', 'Enemies', 'Orc Pack', 'orc.png'], 1200);
  w(['Grinning God', 'May Release', 'Enemies', 'Orc Pack', 'orc.stl'], 'x');

  // --- Edge: NO config AND no image, just STLs (real Grinning God case)
  w(['Grinning God', 'May Release', 'Enemies', 'Drakthul', 'drakthul.stl'], 'x');
  w(['Grinning God', 'May Release', 'Enemies', 'Drakthul', 'l-wing.stl'], 'x');

  // --- Edge: an unrecognised top-level folder (misplaced release)
  w(
    ['The Trench - Crustaceans of the Deep', 'Models', 'Snapjaw', 'config.orynt3d'],
    model({ name: 'Snapjaw' })
  );
  img(['The Trench - Crustaceans of the Deep', 'Models', 'Snapjaw', 'snapjaw.png'], 900);
  w(['The Trench - Crustaceans of the Deep', 'Models', 'Snapjaw', 'snapjaw.stl'], 'x');

  // --- Edge: a leaf with a config that has NO modelMode (old/stray) + prints
  //     -- must still be a model (code review 2026-09-02).
  w(
    ['Rescale', 'Molten Hearts', 'enemies', 'Oldstyle_Supports', 'config.orynt3d'],
    cfg({ scancfg: { tags: { include: ['ogre'] } }, modelmeta: { name: 'Oldstyle Ogre' } })
  );
  img(['Rescale', 'Molten Hearts', 'enemies', 'Oldstyle_Supports', 'oldstyle.jpg'], 500);
  w(['Rescale', 'Molten Hearts', 'enemies', 'Oldstyle_Supports', 'oldstyle.stl'], 'x');

  // --- Edge: a modelMode:2 (container) config sitting in a print-file leaf
  //     -- must be respected as a container, NOT emitted as a model.
  w(['Rescale', 'Molten Hearts', 'enemies', 'ContainerLeaf', 'config.orynt3d'], container());
  w(['Rescale', 'Molten Hearts', 'enemies', 'ContainerLeaf', 'stray.stl'], 'x');

  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    // 8 modelMode:0 + 2 config-less leaves + 1 no-modelMode config leaf (Oldstyle)
    expectedModelCount: 11,
  };
}
