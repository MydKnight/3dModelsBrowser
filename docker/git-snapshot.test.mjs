// Drives docker/lib/git-snapshot.harness.sh (throwaway local repos, no Docker,
// no network) to verify the container's git flow: one moving snapshot commit,
// dropped+rebuilt each run, re-parented over code commits, no-op when unchanged.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const harness = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'lib/git-snapshot.harness.sh'
);

describe('git-snapshot.sh (container git flow)', () => {
  // The harness runs ~20 git commands across 4 simulated container runs;
  // git on Windows is slow.
  it('keeps exactly one snapshot commit across runs, re-parenting over code', { timeout: 30_000 }, () => {
    let out;
    try {
      out = execFileSync('bash', [harness], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      throw new Error(
        `harness failed:\n${err.stdout ?? ''}\n${err.stderr ?? ''}`
      );
    }
    expect(out).toContain('HARNESS OK');
  });
});
