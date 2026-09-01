// scripts/lib/recency.cjs
// Pure, unit-tested pieces of the D6a recency signal (docs/astro-rewrite-spec.md).
// CommonJS to match extract-model-data.cjs, which requires() this directly.
// No fs/NAS access in here on purpose -- that stays in extract-model-data.cjs,
// which is exempt from coverage; this file is the in-scope 85% target.

/**
 * Derive a retroactive "when did this land" timestamp from filesystem stats.
 * Prefers birthtime; some filesystems (notably many network shares and some
 * Linux filesystems) report birthtime as 0 or missing when it isn't tracked,
 * so fall back to mtime in that case, and to `now` if neither is usable.
 * @param {{birthtimeMs?: number, mtimeMs?: number}} [stats] - fs.Stats-shaped object
 * @param {number} [now] - injectable for tests; defaults to Date.now()
 * @returns {number} milliseconds since epoch
 */
function computeAddedTs(stats, now = Date.now()) {
  if (stats && typeof stats.birthtimeMs === 'number' && stats.birthtimeMs > 0) {
    return stats.birthtimeMs;
  }
  if (stats && typeof stats.mtimeMs === 'number' && stats.mtimeMs > 0) {
    return stats.mtimeMs;
  }
  return now;
}

/**
 * Preserve a model's first-seen timestamp across extract runs. The first time
 * an id is seen it is stamped `now`; every run after that carries the
 * previously stamped value forward unchanged, regardless of what `now` is on
 * that later run. This is what makes "newest first" (spec D4/O3) meaningful --
 * `extract-model-data.cjs`'s `dateAdded` was previously reset on every scan.
 * @param {string} modelId
 * @param {Map<string, {firstSeenTs?: number}>} existingRecency - previous run's data, keyed by model id
 * @param {number} [now] - injectable for tests; defaults to Date.now()
 * @returns {number} the firstSeenTs to persist for this model
 */
function mergeFirstSeenTs(modelId, existingRecency, now = Date.now()) {
  const existing = existingRecency.get(modelId);
  if (existing && typeof existing.firstSeenTs === 'number' && existing.firstSeenTs > 0) {
    return existing.firstSeenTs;
  }
  return now;
}

module.exports = { computeAddedTs, mergeFirstSeenTs };
