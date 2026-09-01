// docs/astro-rewrite-spec.md -- Testing: "extract-model-data.cjs -- recency
// merge (D6a)". Covers scripts/lib/recency.cjs only (pure logic); the NAS
// scan/walk in extract-model-data.cjs itself stays exempt.
import { describe, expect, it } from 'vitest';
import { computeAddedTs, mergeFirstSeenTs } from './recency.cjs';

describe('computeAddedTs', () => {
  it('prefers birthtimeMs when present and positive', () => {
    expect(computeAddedTs({ birthtimeMs: 1000, mtimeMs: 2000 })).toBe(1000);
  });

  it('falls back to mtimeMs when birthtimeMs is 0 (unsupported on this filesystem)', () => {
    expect(computeAddedTs({ birthtimeMs: 0, mtimeMs: 2000 })).toBe(2000);
  });

  it('falls back to mtimeMs when birthtimeMs is missing', () => {
    expect(computeAddedTs({ mtimeMs: 2000 })).toBe(2000);
  });

  it('falls back to `now` when both timestamps are missing or zero', () => {
    expect(computeAddedTs({ birthtimeMs: 0, mtimeMs: 0 }, 4242)).toBe(4242);
  });

  it('falls back to `now` when stats is missing entirely', () => {
    expect(computeAddedTs(undefined, 4242)).toBe(4242);
  });

  it('defaults `now` to Date.now() when not injected', () => {
    const before = Date.now();
    const result = computeAddedTs(undefined);
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

describe('mergeFirstSeenTs', () => {
  it('stamps `now` for a model id never seen before', () => {
    const existing = new Map();
    expect(mergeFirstSeenTs('model-a', existing, 5000)).toBe(5000);
  });

  it('preserves the previously stamped firstSeenTs on subsequent runs', () => {
    const existing = new Map([['model-a', { firstSeenTs: 1000 }]]);
    expect(mergeFirstSeenTs('model-a', existing, 9999)).toBe(1000);
  });

  it('does not let a later run with an earlier `now` override an existing stamp', () => {
    const existing = new Map([['model-a', { firstSeenTs: 9999 }]]);
    expect(mergeFirstSeenTs('model-a', existing, 1000)).toBe(9999);
  });

  it('re-stamps if the existing entry has a non-positive firstSeenTs', () => {
    const existing = new Map([['model-a', { firstSeenTs: 0 }]]);
    expect(mergeFirstSeenTs('model-a', existing, 4242)).toBe(4242);
  });

  it('re-stamps if the existing entry is missing firstSeenTs entirely', () => {
    const existing = new Map([['model-a', {}]]);
    expect(mergeFirstSeenTs('model-a', existing, 7)).toBe(7);
  });

  it('is independent per model id', () => {
    const existing = new Map([['model-a', { firstSeenTs: 100 }]]);
    expect(mergeFirstSeenTs('model-b', existing, 200)).toBe(200);
    expect(mergeFirstSeenTs('model-a', existing, 200)).toBe(100);
  });
});
