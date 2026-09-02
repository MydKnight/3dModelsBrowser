// scripts/scan-nas.mjs
// Walks the Orynt3D NAS tree and writes data/raw/models.json (gitignored).
// Replaces extract-model-data.cjs. Design: docs/nas-scan-spec.md.
// The fs walk itself is exempt from coverage (NAS I/O); the resolution logic is
// in scripts/lib/model-resolve.mjs (unit-tested) and scripts/lib/recency.cjs.
// scanTree() is pure-ish (fs reads only, no writes) so an integration test can
// run it against tests/fixtures/build-nas-fixture.mjs.
//
// Run: node scripts/scan-nas.mjs   (or ORYNT3D_DIR=... node scripts/scan-nas.mjs)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveName,
  resolveSubscription,
  resolveRelease,
  resolveTags,
  pickSourceImage,
  makeId,
} from './lib/model-resolve.mjs';
import { computeAddedTs, mergeFirstSeenTs } from './lib/recency.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = '\\\\192.168.254.200\\data\\3D Files';
const OUT_FILE = path.join(__dirname, '../data/raw/models.json');
const CONFIG_NAME = 'config.orynt3d';
const MESH_EXTS = new Set(['.stl', '.3mf', '.obj', '.chitubox', '.lys']);
// image-extension handling lives in scripts/lib/model-resolve.mjs (pickSourceImage)

function readConfig(dir, hasConfigFile = true) {
  if (!hasConfigFile) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, CONFIG_NAME), 'utf8'));
  } catch {
    return null;
  }
}
const configAttrs = (c) => c?.scancfg?.attributes?.include ?? [];
const configTags = (c) => c?.scancfg?.tags?.include ?? [];

/**
 * Walk a tree and resolve every model. fs reads only, no writes.
 * @param {string} root
 * @param {Map<string,{firstSeenTs:number}>} [prior] - for firstSeenTs preservation
 * @returns {{ models: object[], stats: {dirs:number,models:number,noImage:number,unknownSub:number,unknownSubNames:Set<string>,skippedDirs:string[]} }}
 */
export function scanTree(root, prior = new Map(), { onProgress } = {}) {
  const stats = {
    dirs: 0,
    models: 0,
    noImage: 0,
    unknownSub: 0,
    unknownSubNames: new Set(),
    skippedDirs: [],
  };
  const models = [];

  // The share is SMB-over-VPN: readdir fails transiently. Retry a few times
  // with backoff before giving up on a directory -- a silently skipped subtree
  // means missing models (2026-09-01: a congested link dropped ~3k models).
  const readdirResilient = (absDir) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return fs.readdirSync(absDir, { withFileTypes: true });
      } catch (err) {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || attempt >= 5) throw err;
        const ms = 300 * 2 ** attempt;
        const until = Date.now() + ms;
        while (Date.now() < until) {
          /* sync backoff -- scanTree is synchronous */
        }
      }
    }
  };

  const walk = (absDir, relSegments, ancestorAttrs, ancestorTagLists) => {
    stats.dirs++;
    if (onProgress && stats.dirs % 100 === 0) onProgress(stats);
    let entries;
    try {
      entries = readdirResilient(absDir);
    } catch (err) {
      console.error(`  ⚠️ could not read ${absDir}: ${err.message}`);
      stats.skippedDirs.push(relSegments.join('/'));
      return;
    }

    const subDirs = entries.filter((e) => e.isDirectory());
    const files = entries.filter((e) => e.isFile());
    const config = readConfig(absDir, files.some((f) => f.name === CONFIG_NAME));

    const attrsHere = config ? [...configAttrs(config), ...ancestorAttrs] : ancestorAttrs;
    const tagListsHere = config ? [...ancestorTagLists, configTags(config)] : ancestorTagLists;

    const meshFiles = files.filter((f) => MESH_EXTS.has(path.extname(f.name).toLowerCase()));
    const imageNames = files.map((f) => f.name);

    // A leaf full of print files is a model unless a config there explicitly
    // marks it a container (modelMode 2). Covers: modelMode 0 configs, the
    // no-config Grinning God case, and a stray/old config in a leaf that isn't
    // modelMode 0 (the "silently dropped model" class -- code review 2026-09-02).
    const isContainerConfig = config?.scancfg?.modelMode === 2;
    const isLeafWithPrints = subDirs.length === 0 && meshFiles.length > 0;

    if (config?.scancfg?.modelMode === 0 || (isLeafWithPrints && !isContainerConfig)) {
      emit(absDir, relSegments, config, attrsHere, tagListsHere, imageNames);
      return; // models are leaves
    }
    for (const d of subDirs) {
      walk(path.join(absDir, d.name), [...relSegments, d.name], attrsHere, tagListsHere);
    }
  };

  const emit = (absDir, relSegments, config, attrs, tagLists, imageNames) => {
    const relPath = relSegments.join('/');
    const folderName = relSegments[relSegments.length - 1];
    const name = resolveName({ configName: config?.modelmeta?.name, folderName });
    const sub = resolveSubscription({ attrs, firstSegment: relSegments[0] });
    const release = resolveRelease({ attrs, segments: relSegments });
    const tags = resolveTags({ tagLists: [config?.modelmeta?.tags ?? [], ...tagLists] });
    const id = makeId(name, relPath);
    if (!sub.known) {
      stats.unknownSub++;
      stats.unknownSubNames.add(sub.name);
    }

    const chosen = pickSourceImage(imageNames);
    const sourceImage = chosen ? path.join(absDir, chosen) : null;
    if (!sourceImage) stats.noImage++;

    let addedTs;
    try {
      addedTs = computeAddedTs(fs.statSync(absDir));
    } catch {
      addedTs = computeAddedTs(undefined);
    }

    models.push({
      id,
      name,
      subscription: sub.name,
      release,
      tags,
      relPath,
      sourceImage,
      addedTs,
      firstSeenTs: mergeFirstSeenTs(id, prior),
    });
    stats.models++;
  };

  // A config at the scan root itself (e.g. when ORYNT3D_DIR points straight at
  // one subscription folder) seeds the ancestor attrs/tags for everything below.
  const rootConfig = readConfig(root);
  const seedAttrs = rootConfig ? configAttrs(rootConfig) : [];
  const seedTagLists = rootConfig ? [configTags(rootConfig)] : [];

  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(root, e.name), [e.name], seedAttrs, seedTagLists);
  }

  models.sort((a, b) => (b.firstSeenTs ?? b.addedTs) - (a.firstSeenTs ?? a.addedTs));
  return { models, stats };
}

function loadPriorRecency(outFile) {
  const map = new Map();
  try {
    const prior = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    for (const m of prior.models ?? []) {
      if (m.id && typeof m.firstSeenTs === 'number') map.set(m.id, { firstSeenTs: m.firstSeenTs });
    }
  } catch {
    /* first run */
  }
  return map;
}

export function main() {
  const root = process.env.ORYNT3D_DIR || DEFAULT_ROOT;
  const outArg = process.argv.indexOf('--out');
  const outFile = outArg !== -1 && process.argv[outArg + 1] ? process.argv[outArg + 1] : OUT_FILE;

  if (!fs.existsSync(root)) {
    console.error(`❌ Scan root not found: ${root}\n   Set ORYNT3D_DIR or connect to the NAS.`);
    process.exit(1);
  }
  console.log(`🔍 Scanning ${root} ...`);
  const start = Date.now();
  const prior = loadPriorRecency(outFile);
  const { models, stats } = scanTree(root, prior, {
    onProgress: (s) => {
      const secs = ((Date.now() - start) / 1000).toFixed(0);
      process.stdout.write(`\r  ${s.dirs} dirs, ${s.models} models  [${secs}s]   `);
    },
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify({ scannedAt: new Date().toISOString(), root, models }, null, 2)
  );

  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\n✅ ${stats.models} models from ${stats.dirs} dirs in ${secs}s ` +
      `(${stats.noImage} without an image, ${stats.unknownSub} with an unrecognised subscription)`
  );
  if (stats.unknownSubNames.size) {
    console.log(
      `⚠️  unrecognised subscription folder(s) -- likely a misplaced release; ` +
        `move under the right subscription, or add to SUBSCRIPTION_CANON:`
    );
    for (const s of stats.unknownSubNames) console.log(`     "${s}"`);
  }
  if (stats.skippedDirs.length) {
    console.log(
      `\n❌ ${stats.skippedDirs.length} director(ies) could not be read after retries -- ` +
        `this scan is INCOMPLETE. Re-run against a quiet NAS:`
    );
    for (const d of stats.skippedDirs.slice(0, 20)) console.log(`     ${d}`);
    if (stats.skippedDirs.length > 20) console.log(`     ...and ${stats.skippedDirs.length - 20} more`);
    process.exitCode = 1;
  }
  console.log(`💾 ${outFile}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
