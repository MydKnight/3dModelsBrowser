// scripts/make-thumbnails.mjs
// Build-order step 2 (docs/astro-rewrite-spec.md D6, docs/nas-scan-spec.md).
// Reads data/raw/models.json (from scan-nas.mjs) and emits two committed WebP
// renditions per model:
//   public/thumbnails/<id>.webp  ~400px longest edge (grid)
//   public/detail/<id>.webp      ~900px longest edge (detail page)
// sharp + fs -- exempt from the coverage target; the testable path helpers are
// in scripts/lib/thumbnail-paths.cjs.
//
// Resilience: the source images live on an SMB share over a VPN. fs calls there
// fail transiently (ETIMEDOUT / EIO / EBUSY) and fs.existsSync can't tell that
// apart from "not found". So: retry-with-backoff per model, treat only a
// definitive ENOENT as "no image" (-> placeholder later), and ABORT the run if
// the transient-error rate climbs (rather than marking thousands of reachable
// models imageless, as happened 2026-09-01).
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

const MAX_RETRIES = 4;
const RETRY_BASE_MS = 500;
// Abort if, after this many models processed, transient errors exceed this rate.
const ABORT_AFTER = 40;
const ABORT_RATE = 0.35;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const i = argv.indexOf('--limit');
  const limit = i !== -1 && argv[i + 1] ? Number.parseInt(argv[i + 1], 10) : undefined;
  return { limit, force: argv.includes('--force') };
}

class SourceMissingError extends Error {}

/** True if `err` looks like a transient network/share problem, not "not found". */
function isTransient(err) {
  const code = err?.code ?? '';
  if (['ETIMEDOUT', 'EIO', 'EBUSY', 'EAGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET'].includes(code)) {
    return true;
  }
  // sharp wraps read failures in its own message
  return /timed out|input\/output error|resource busy/i.test(err?.message ?? '');
}

function srcMtimeOrThrow(srcPath) {
  try {
    return fs.statSync(srcPath).mtimeMs;
  } catch (err) {
    if (err.code === 'ENOENT') throw new SourceMissingError(srcPath);
    throw err; // transient -> handled by the retry loop
  }
}

/** Process one model's two renditions. Throws SourceMissingError or a transient error. */
async function processModel(model, force) {
  const srcMtime = srcMtimeOrThrow(model.sourceImage);
  let didWork = false;
  for (const r of RENDITIONS) {
    const destPath = r.pathFor(model.id, r.dir);
    if (!force) {
      try {
        if (fs.statSync(destPath).mtimeMs >= srcMtime) continue; // up to date
      } catch {
        /* not there yet -- generate */
      }
    }
    await sharp(model.sourceImage)
      .resize({ width: r.width, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: r.quality })
      .toFile(destPath);
    didWork = true;
  }
  return didWork ? 'written' : 'skipped';
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

  const counts = { written: 0, skipped: 0, missing: 0, error: 0 };
  const missing = [];
  const errored = [];
  let processed = 0;
  const t0 = Date.now();

  for (const model of todo) {
    if (!model.sourceImage) {
      counts.missing++;
      missing.push(model.id);
      continue;
    }

    let done = false;
    for (let attempt = 0; attempt <= MAX_RETRIES && !done; attempt++) {
      try {
        counts[await processModel(model, force)]++;
        done = true;
      } catch (err) {
        if (err instanceof SourceMissingError) {
          counts.missing++;
          missing.push(model.id);
          done = true;
        } else if (isTransient(err) && attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_MS * 2 ** attempt);
        } else {
          counts.error++;
          errored.push({ id: model.id, reason: err.message });
          done = true;
        }
      }
    }

    if (++processed % 100 === 0) {
      const rate = ((Date.now() - t0) / processed / 1000).toFixed(1);
      process.stdout.write(
        `\r  ${processed}/${todo.length}  (written ${counts.written}, skipped ${counts.skipped}, ` +
          `missing ${counts.missing}, error ${counts.error})  ~${rate}s/model   `
      );
    }

    if (processed >= ABORT_AFTER && counts.error / processed > ABORT_RATE) {
      console.error(
        `\n\n❌ Aborting: ${counts.error}/${processed} models hit transient NAS errors ` +
          `(> ${ABORT_RATE * 100}%). The share is likely unreachable/congested -- ` +
          `re-run later (skip-if-exists means finished models are kept).`
      );
      process.exit(1);
    }
  }

  console.log(
    `\n✅ written=${counts.written} skipped=${counts.skipped} missing=${counts.missing} error=${counts.error}`
  );
  if (missing.length) {
    console.log(`\nℹ️  ${missing.length} model(s) have no render on the NAS -> placeholder in build-filter-index:`);
    for (const id of missing.slice(0, 15)) console.log(`   ${id}`);
    if (missing.length > 15) console.log(`   ...and ${missing.length - 15} more`);
  }
  if (errored.length) {
    console.log(`\n⚠️  ${errored.length} model(s) errored (transient, not confirmed missing) -- re-run to retry:`);
    for (const e of errored.slice(0, 15)) console.log(`   ${e.id}: ${e.reason}`);
    if (errored.length > 15) console.log(`   ...and ${errored.length - 15} more`);
    // Exit non-zero only if a meaningful fraction stayed broken -- a couple of
    // stragglers shouldn't block a container run from committing thousands of
    // good thumbnails. They get retried on the next run (skip-if-exists).
    if (errored.length > Math.max(10, processed * 0.02)) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`❌ Fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
