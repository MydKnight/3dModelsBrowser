// Perf sanity check against real-volume data (the dev bootstrap, or the real
// snapshot once it exists). Skipped when src/data/filter-index.json isn't
// present. Not a hard benchmark -- just a guard that filter + facet stay in the
// sub-millisecond range the design (D4) claims.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FilterEngine, emptyState, type FilterIndex } from './filter-engine';

const dataPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/filter-index.json'
);
const hasData = fs.existsSync(dataPath);

describe.skipIf(!hasData)('FilterEngine perf (real-volume data)', () => {
  const index: FilterIndex = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const engine = new FilterEngine(index);

  it(`builds and filters ${hasData ? index.models.length : 0} models fast`, () => {
    const state = {
      ...emptyState(),
      tags: [0, 1],
      subs: [0],
      query: 'a',
      sort: 'name' as const,
    };
    const runs = 200;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      engine.filter(state);
      engine.facetCounts(state);
    }
    const perCycle = (performance.now() - t0) / runs;
    // Generous ceiling -- design target is well under 1ms; CI machines vary.
    expect(perCycle).toBeLessThan(15);
  });
});
