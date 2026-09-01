// scripts/make-thumbnails.mjs
// Build-order step 2 (docs/astro-rewrite-spec.md -- D6/D6a). Reads the extract
// step's output and emits two committed WebP renditions per model:
//   public/thumbnails/<id>.webp  ~400px longest edge (grid)
//   public/detail/<id>.webp      ~900px longest edge (detail page)
// File I/O + sharp calls are exempt from the coverage target, same as the NAS
// scan in extract-model-data.cjs -- the testable part is scripts/lib/thumbnail-paths.cjs.
//
// Run manually: node scripts/make-thumbnails.mjs [--limit N] [--force]
// (npm run data chains this after extract-model-data.cjs, see package.json)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  resolveSourceImagePath,
  thumbnailPathFor,
  detailImagePathFor,
} from './lib/thumbnail-paths.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../public/orynt3d-data.json');
const LEGACY_IMAGES_DIR = path.join(__dirname, '../public/images');
const THUMBNAILS_DIR = path.join(__dirname, '../public/thumbnails');
const DETAIL_DIR = path.join(__dirname, '../public/detail');

const RENDITIONS = [
  { name: 'thumbnail', width: 400, quality: 78, pathFor: thumbnailPathFor, dir: THUMBNAILS_DIR },
  { name: 'detail', width: 900, quality: 80, pathFor: detailImagePathFor, dir: DETAIL_DIR },
];

function parseArgs(argv) {
  const limitFlagIndex = argv.indexOf('--limit');
  const limit =
    limitFlagIndex !== -1 && argv[limitFlagIndex + 1]
      ? Number.parseInt(argv[limitFlagIndex + 1], 10)
      : undefined;
  return { limit, force: argv.includes('--force') };
}

async function renderOne(srcPath, destPath, { width, quality, force }) {
  if (!force && fs.existsSync(destPath)) {
    const [srcStat, destStat] = [fs.statSync(srcPath), fs.statSync(destPath)];
    if (destStat.mtimeMs >= srcStat.mtimeMs) {
      return 'skipped';
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

  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ ${DATA_FILE} not found. Run extract-model-data.cjs first.`);
    process.exit(1);
  }
  for (const dir of [THUMBNAILS_DIR, DETAIL_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const models = limit ? data.models.slice(0, limit) : data.models;
  console.log(
    `🖼️  Generating thumbnails for ${models.length}${limit ? ` (of ${data.models.length})` : ''} models...`
  );

  const counts = { written: 0, skipped: 0, missing: 0, failed: 0 };
  const problems = [];

  for (const model of models) {
    const srcPath = resolveSourceImagePath(model, { legacyImagesDir: LEGACY_IMAGES_DIR });
    if (!srcPath || !fs.existsSync(srcPath)) {
      counts.missing++;
      problems.push({ id: model.id, name: model.name, reason: 'no source image found' });
      continue;
    }

    try {
      for (const rendition of RENDITIONS) {
        const destPath = rendition.pathFor(model.id, rendition.dir);
        const result = await renderOne(srcPath, destPath, {
          width: rendition.width,
          quality: rendition.quality,
          force,
        });
        counts[result]++;
      }
    } catch (error) {
      counts.failed++;
      problems.push({ id: model.id, name: model.name, reason: error.message });
    }
  }

  console.log(
    `✅ Done. written=${counts.written} skipped=${counts.skipped} missing=${counts.missing} failed=${counts.failed}`
  );
  if (problems.length > 0) {
    console.log(`\n⚠️ ${problems.length} model(s) need attention before build-filter-index.mjs runs:`);
    for (const p of problems.slice(0, 20)) {
      console.log(`   - ${p.id} (${p.name}): ${p.reason}`);
    }
    if (problems.length > 20) {
      console.log(`   ...and ${problems.length - 20} more`);
    }
  }
}

main().catch((error) => {
  console.error(`❌ Fatal error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
