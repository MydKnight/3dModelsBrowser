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
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function readConfig(dir) {
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
 * @returns {{ models: object[], stats: {dirs:number,models:number,noImage:number,unknownSub:number} }}
 */
export function scanTree(root, prior = new Map()) {
  const stats = { dirs: 0, models: 0, noImage: 0, unknownSub: 0 };
  const models = [];

  const walk = (absDir, relSegments, ancestorAttrs, ancestorTagLists) => {
    stats.dirs++;
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      console.error(`  skip ${absDir}: ${err.message}`);
      return;
    }

    const subDirs = entries.filter((e) => e.isDirectory());
    const files = entries.filter((e) => e.isFile());
    const config = readConfig(absDir);

    const attrsHere = config ? [...configAttrs(config), ...ancestorAttrs] : ancestorAttrs;
    const tagListsHere = config ? [...ancestorTagLists, configTags(config)] : ancestorTagLists;

    const meshFiles = files.filter((f) => MESH_EXTS.has(path.extname(f.name).toLowerCase()));
    const imageFiles = files
      .filter((f) => IMAGE_EXTS.has(path.extname(f.name).toLowerCase()))
      .map((f) => {
        let size = 0;
        try {
          size = fs.statSync(path.join(absDir, f.name)).size;
        } catch {
          /* ignore */
        }
        return { name: f.name, size };
      });

    const isModelConfig = config?.scancfg?.modelMode === 0;
    const isFallbackModel =
      !config && subDirs.length === 0 && meshFiles.length > 0 && imageFiles.length > 0;

    if (isModelConfig || isFallbackModel) {
      emit(absDir, relSegments, config, attrsHere, tagListsHere, imageFiles);
      return; // models are leaves
    }
    for (const d of subDirs) {
      walk(path.join(absDir, d.name), [...relSegments, d.name], attrsHere, tagListsHere);
    }
  };

  const emit = (absDir, relSegments, config, attrs, tagLists, imageFiles) => {
    const relPath = relSegments.join('/');
    const folderName = relSegments[relSegments.length - 1];
    const name = resolveName({ configName: config?.modelmeta?.name, folderName });
    const sub = resolveSubscription({ attrs, firstSegment: relSegments[0] });
    const release = resolveRelease({ attrs, segments: relSegments });
    const tags = resolveTags({ tagLists: [config?.modelmeta?.tags ?? [], ...tagLists] });
    const id = makeId(name, relPath);
    if (!sub.known) stats.unknownSub++;

    const chosen = pickSourceImage(imageFiles);
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
  if (!fs.existsSync(root)) {
    console.error(`❌ Scan root not found: ${root}\n   Set ORYNT3D_DIR or connect to the NAS.`);
    process.exit(1);
  }
  console.log(`🔍 Scanning ${root} ...`);
  const start = Date.now();
  const prior = loadPriorRecency(OUT_FILE);
  const { models, stats } = scanTree(root, prior);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify({ scannedAt: new Date().toISOString(), root, models }, null, 2)
  );

  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `✅ ${stats.models} models from ${stats.dirs} dirs in ${secs}s ` +
      `(${stats.noImage} without an image, ${stats.unknownSub} with an unrecognised subscription)`
  );
  console.log(`💾 ${OUT_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
