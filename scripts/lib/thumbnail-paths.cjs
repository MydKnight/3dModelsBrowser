// scripts/lib/thumbnail-paths.cjs
// Pure dest-path helpers for scripts/make-thumbnails.mjs (spec D6). No fs here.
// (Source-image resolution moved to scan-nas.mjs / model-resolve.mjs -- the
// model record already carries an absolute `sourceImage`.)

const path = require('path');

/** Where a model's grid thumbnail (~400px, spec D6) is written. */
function thumbnailPathFor(modelId, thumbnailsDir) {
  return path.join(thumbnailsDir, `${modelId}.webp`);
}

/** Where a model's detail image (~900px, spec D6) is written. */
function detailImagePathFor(modelId, detailDir) {
  return path.join(detailDir, `${modelId}.webp`);
}

module.exports = { thumbnailPathFor, detailImagePathFor };
