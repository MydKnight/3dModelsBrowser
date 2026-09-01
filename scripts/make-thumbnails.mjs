// scripts/make-thumbnails.mjs
// Build-order step 2 (docs/astro-rewrite-spec.md D6, docs/nas-scan-spec.md).
// Reads data/raw/models.json (from scan-nas.mjs) and emits two committed WebP
// renditions per model:
//   public/thumbnails/<id>.webp  ~400px longest edge (grid)
//   public/detail/<id>.webp      ~900px longest edge (detail page)
// sharp + fs -- exempt from the coverage target; the testable path helpers are
// in scripts/lib/thumbnail-paths.cjs.
//
// Run: node scripts/make-thumbnails.mjs [--limit N] [--force]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { thumbnailPathFor, detailImagePathFor } from './lib/thumbnail-paths.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_FILE = path.join(__dirname, '../data/raw/models.json');
const THUMBNAILS_DIR = path.join(__dirname, '../public/thumbnails');
const DETAIL_DIR = path.join(__dirname, '../public/detail');

const RENDITIONS = [
  { width: 400, quality: 78, pathFor: thumbnailPathFor, dir: THUMBNAILS_DIR },
  { width: 900, quality: 80, pathFor: detailImagePathFor, dir: DETAIL_DIR },
];

function parseArgs(argv) {
  const i = argv.indexOf('--limit');
  const limit = i !== -1 && argv[i + 1] ? Number.parseInt(argv[i + 1], 10) : undefined;
  return { limit, force: argv.includes('--force') };
}

async function renderOne(srcPath, destPath, { width, quality, force }) {
  if (!force && fs.existsSync(destPath)) {
    try {
      if (fs.statSync(destPath).mtimeMs >= fs.statSync(srcPath).mtimeMs) return 'skipped';
    } catch {
      /* fall through and regenerate */
    }
  }
  await sharp(srcPath)
    .resize({ width, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality })
    .toFile(destPath);
  return 'written';
}

async function main() {
  const { limit, force } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(MODELS_FILE)) {
    console.error(`❌ ${MODELS_FILE} not found. Run scan-nas.mjs first.`);
    process.exit(1);
  }
  for (const dir of [THUMBNAILS_DIR, DETAIL_DIR]) fs.mkdirSync(dir, { recursive: true });

  const { models } = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
  const todo = limit ? models.slice(0, limit) : models;
  console.log(`🖼️  Thumbnails for ${todo.length}${limit ? ` of ${models.length}` : ''} models...`);

  const counts = { written: 0, skipped: 0, missing: 0, failed: 0 };
  const problems = [];

  for (const model of todo) {
    if (!model.sourceImage || !fs.existsSync(model.sourceImage)) {
      counts.missing++;
      problems.push({ id: model.id, name: model.name, reason: 'no source image on disk' });
      continue;
    }
    try {
      for (const r of RENDITIONS) {
        const result = await renderOne(model.sourceImage, r.pathFor(model.id, r.dir), {
          width: r.width,
          quality: r.quality,
          force,
        });
        counts[result]++;
      }
    } catch (err) {
      counts.failed++;
      problems.push({ id: model.id, name: model.name, reason: err.message });
    }
  }

  console.log(
    `✅ written=${counts.written} skipped=${counts.skipped} missing=${counts.missing} failed=${counts.failed}`
  );
  if (problems.length) {
    console.log(`\n⚠️ ${problems.length} model(s) need attention before build-filter-index.mjs:`);
    for (const p of problems.slice(0, 20)) console.log(`   - ${p.id} (${p.name}): ${p.reason}`);
    if (problems.length > 20) console.log(`   ...and ${problems.length - 20} more`);
  }
}

main().catch((err) => {
  console.error(`❌ Fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
