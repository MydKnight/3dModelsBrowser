// scripts/build-filter-index.mjs
// Build-order step 3 (docs/astro-rewrite-spec.md -- Data contract).
// Reads data/raw/models.json (scan-nas.mjs output) and writes the committed,
// NAS-independent client snapshot:
//   src/data/filter-index.json  -- lean per-model records for the filter island
//   src/data/details.json       -- full per-model metadata for /m/[id] pages
// buildIndex() is pure; main() does the fs.
//
// Run: node scripts/build-filter-index.mjs [--no-thumb-check]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RAW = path.join(__dirname, '../data/raw/models.json');
const THUMBS_DIR = path.join(__dirname, '../public/thumbnails');
const OUT_DIR = path.join(__dirname, '../src/data');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

const recencyKey = (m) => m.firstSeenTs ?? m.addedTs ?? 0;

/**
 * @param {object[]} rawModels - scan-nas.mjs per-model shape
 * @param {{ thumbnailExists?: (id:string)=>boolean, skipThumbCheck?: boolean }} [opts]
 * @returns {{ filterIndex: object, details: Record<string, object> }}
 */
export function buildIndex(rawModels, { thumbnailExists = () => true, skipThumbCheck = false } = {}) {
  const seen = new Set();
  for (const m of rawModels) {
    if (!m.id) throw new Error(`build-filter-index: model has no id: ${JSON.stringify(m).slice(0, 200)}`);
    if (seen.has(m.id)) throw new Error(`build-filter-index: duplicate id: ${m.id}`);
    seen.add(m.id);
  }

  if (!skipThumbCheck) {
    const missing = rawModels.filter((m) => !thumbnailExists(m.id));
    if (missing.length) {
      const sample = missing.slice(0, 5).map((m) => m.id).join(', ');
      throw new Error(
        `build-filter-index: ${missing.length} model(s) missing a thumbnail (${sample}${
          missing.length > 5 ? ', ...' : ''
        }). Run make-thumbnails.mjs, or pass --no-thumb-check for dev.`
      );
    }
  }

  const sorted = [...rawModels].sort((a, b) => recencyKey(b) - recencyKey(a));

  const tagSet = new Set();
  const subSet = new Set();
  const relSet = new Set();
  for (const m of sorted) {
    for (const t of m.tags ?? []) tagSet.add(t);
    if (m.subscription) subSet.add(m.subscription);
    if (m.release) relSet.add(m.release);
  }
  const tags = [...tagSet].sort();
  const subs = [...subSet].sort();
  const rels = [...relSet].sort();
  const tagIx = new Map(tags.map((t, i) => [t, i]));
  const subIx = new Map(subs.map((s, i) => [s, i]));
  const relIx = new Map(rels.map((r, i) => [r, i]));

  const models = sorted.map((m) => ({
    id: m.id,
    n: m.name,
    nl: String(m.name).toLowerCase(),
    t: (m.tags ?? []).map((t) => tagIx.get(t)).sort((a, b) => a - b),
    s: subIx.get(m.subscription),
    r: m.release ? relIx.get(m.release) : null,
    th: `${m.id}.webp`,
  }));

  const details = {};
  for (const m of sorted) {
    details[m.id] = {
      name: m.name,
      tags: m.tags ?? [],
      subscription: m.subscription,
      release: m.release ?? null,
      relPath: m.relPath,
      dateAdded: new Date(recencyKey(m)).toISOString(),
    };
  }

  return { filterIndex: { tags, subs, rels, models }, details };
}

export function main() {
  const skipThumbCheck = process.argv.includes('--no-thumb-check');
  const rawFile = argValue('--raw') ? path.resolve(argValue('--raw')) : DEFAULT_RAW;

  if (!fs.existsSync(rawFile)) {
    console.error(`❌ ${rawFile} not found. Run scan-nas.mjs first.`);
    process.exit(1);
  }
  const { models: rawModels } = JSON.parse(fs.readFileSync(rawFile, 'utf8'));

  let result;
  try {
    result = buildIndex(rawModels, {
      skipThumbCheck,
      thumbnailExists: (id) => fs.existsSync(path.join(THUMBS_DIR, `${id}.webp`)),
    });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'filter-index.json'),
    JSON.stringify(result.filterIndex)
  );
  fs.writeFileSync(path.join(OUT_DIR, 'details.json'), JSON.stringify(result.details));

  const { tags, subs, rels, models } = result.filterIndex;
  console.log(
    `✅ filter-index.json: ${models.length} models, ${tags.length} tags, ` +
      `${subs.length} subscriptions, ${rels.length} releases`
  );
  console.log(`✅ details.json: ${Object.keys(result.details).length} entries`);
  console.log(`💾 ${OUT_DIR}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
