// scripts/dev-bootstrap-raw.mjs
// THROWAWAY. Converts the committed legacy public/orynt3d-data.json (944 stale
// but real models) into data/raw/models.bootstrap.json in scan-nas.mjs's shape,
// so build-filter-index.mjs + the filter island / grid can be built against
// realistic data volume before the real (slow) NAS scan has run.
//
// Delete this once `npm run data` has produced a real data/raw/models.json.
//   node scripts/dev-bootstrap-raw.mjs
//   node scripts/build-filter-index.mjs --raw data/raw/models.bootstrap.json --no-thumb-check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBSCRIPTION_CANON } from './lib/model-resolve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../public/orynt3d-data.json');
const OUT = path.join(__dirname, '../data/raw/models.bootstrap.json');

const canonSub = (raw) =>
  SUBSCRIPTION_CANON[String(raw ?? '').toLowerCase()] ??
  String(raw ?? 'Unknown').replace(/\b\w/g, (c) => c.toUpperCase());
const titleCase = (s) =>
  String(s ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i && ['of', 'the', 'in', 'a', 'and', 'to'].includes(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ') || null;

const legacy = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const models = legacy.models.map((m) => {
  const ts = Date.parse(m.dateAdded) || Date.now();
  const rel = (m.relativeSourcePath || m.sourcePath || '')
    .replace(/[\\/]config\.orynt3d$/i, '')
    .replace(/\\/g, '/');
  return {
    id: m.id,
    name: m.name,
    subscription: canonSub(m.subscription),
    release: titleCase(m.release),
    tags: [...new Set((m.tags || []).map((t) => String(t).toLowerCase()))].sort(),
    relPath: rel,
    sourceImage: m.image
      ? path.join(__dirname, '../public/images', path.basename(m.image))
      : null,
    addedTs: ts,
    firstSeenTs: ts,
  };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ scannedAt: new Date().toISOString(), root: 'BOOTSTRAP', models }, null, 2));
console.log(`✅ ${models.length} models -> ${OUT} (bootstrap, throwaway)`);
