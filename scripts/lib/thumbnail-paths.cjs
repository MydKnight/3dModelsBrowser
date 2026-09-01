// scripts/lib/thumbnail-paths.cjs
// Pure path-resolution logic for scripts/make-thumbnails.mjs (spec D6,
// build-order step 2). No fs access here -- callers do existsSync/statSync.
// The actual sharp calls in make-thumbnails.mjs are exempt from coverage,
// same as the NAS scan in extract-model-data.cjs; this file is the in-scope part.

const path = require('path');

/**
 * Decide which on-disk file to read as the source image for a model, given
 * the `image` field extract-model-data.cjs produced for it.
 * @param {{image?: string}} model
 * @param {{legacyImagesDir: string}} opts - absolute path to the legacy public/images dir
 * @returns {string|null} absolute source path, or null if there is nothing usable
 */
function resolveSourceImagePath(model, opts) {
  const image = model && model.image;
  if (!image || typeof image !== 'string') return null;

  if (image.startsWith('http://') || image.startsWith('https://')) {
    // Not a real case in this collection today, but don't silently mishandle
    // one if it shows up -- there's no local file to read.
    return null;
  }

  if (image.startsWith('/images/')) {
    // Legacy web path (spec Current State): the raw NAS path that produced it
    // is gone, so the only remaining copy is what build-nextjs-app.cjs already
    // placed in public/images/.
    return path.join(opts.legacyImagesDir, path.basename(image));
  }

  // Anything else is a raw filesystem path found on this scan.
  return image;
}

/** Where a model's grid thumbnail (~400px, spec D6) should be written. */
function thumbnailPathFor(modelId, thumbnailsDir) {
  return path.join(thumbnailsDir, `${modelId}.webp`);
}

/** Where a model's detail image (~900px, spec D6) should be written. */
function detailImagePathFor(modelId, detailDir) {
  return path.join(detailDir, `${modelId}.webp`);
}

module.exports = { resolveSourceImagePath, thumbnailPathFor, detailImagePathFor };
