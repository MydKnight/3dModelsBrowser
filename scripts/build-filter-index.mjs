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
import { SUBSCRIPTION_CANON } from './lib/model-resolve.mjs';

const KNOWN_SUBS = new Set(Object.values(SUBSCRIPTION_CANON));
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
export const PLACEHOLDER_THUMB = '_placeholder.webp';

export function buildIndex(rawModels, { thumbnailExists = () => true, skipThumbCheck = false } = {}) {
  const seen = new Set();
  for (const m of rawModels) {
    if (!m.id) throw new Error(`build-filter-index: model has no id: ${JSON.stringify(m).slice(0, 200)}`);
    if (seen.has(m.id)) throw new Error(`build-filter-index: duplicate id: ${m.id}`);
    seen.add(m.id);
  }

  // A model with no rendered `<id>.webp` (its NAS folder had no image, or the
  // pipeline hasn't generated one) still belongs in the gallery -- findable by
  // name and tags. It gets the placeholder thumbnail. `skipThumbCheck` (dev,
  // building against the bootstrap) treats everything as present.
  const missingThumb = new Set(
    skipThumbCheck ? [] : rawModels.filter((m) => !thumbnailExists(m.id)).map((m) => m.id)
  );

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
    th: missingThumb.has(m.id) ? PLACEHOLDER_THUMB : `${m.id}.webp`,
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

  return {
    filterIndex: { tags, subs, rels, models },
    details,
    warnings: {
      missingThumb: [...missingThumb],
      unknownSubs: [...new Set(sorted.map((m) => m.subscription))].filter(
        (s) => !KNOWN_SUBS.has(s)
      ),
    },
  };
}

export function main() {
  const skipThumbCheck = process.argv.includes('--no-thumb-check');
  const rawFile = argValue('--raw') ? path.resolve(argValue('--raw')) : DEFAULT_RAW;

  if (!fs.existsSync(rawFile)) {
    console.error(`❌ ${rawFile} not found. Run scan-nas.mjs first.`);
    process.exit(1);
  }
  const { models: rawModels } = JSON.parse(fs.readFileSync(rawFile, 'utf8'));

  if (!skipThumbCheck && !fs.existsSync(THUMBS_DIR)) {
    console.error(`❌ ${THUMBS_DIR} does not exist. Run make-thumbnails.mjs first (or --no-thumb-check).`);
    process.exit(1);
  }

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
  fs.writeFileSync(path.join(OUT_DIR, 'filter-index.json'), JSON.stringify(result.filterIndex));
  fs.writeFileSync(path.join(OUT_DIR, 'details.json'), JSON.stringify(result.details));

  const { tags, subs, rels, models } = result.filterIndex;
  console.log(
    `✅ filter-index.json: ${models.length} models, ${tags.length} tags, ` +
      `${subs.length} subscriptions, ${rels.length} releases`
  );
  console.log(`✅ details.json: ${Object.keys(result.details).length} entries`);

  const { missingThumb, unknownSubs } = result.warnings;
  if (missingThumb.length) {
    console.log(`⚠️  ${missingThumb.length} model(s) have no render -> placeholder thumbnail`);
    for (const id of missingThumb.slice(0, 10)) console.log(`     ${id}`);
    if (missingThumb.length > 10) console.log(`     ...and ${missingThumb.length - 10} more`);
  }
  if (unknownSubs.length) {
    console.log(`⚠️  unrecognised subscription(s) (add to SUBSCRIPTION_CANON or fix the NAS folder):`);
    for (const s of unknownSubs) console.log(`     "${s}"`);
  }
  console.log(`💾 ${OUT_DIR}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
