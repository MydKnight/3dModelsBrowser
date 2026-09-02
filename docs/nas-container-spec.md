# NAS Data Container -- Design Spec

**Status:** Locked -- **ACTIVE feature** as of 2026-09-02
**Target:** `feat/nas-data-container`, branched off **`feat/astro-rewrite`** (it
needs that branch's `scripts/` -- and astro-rewrite is parked, so the eventual
merge back is a fast-forward)
**Date:** 2026-09-02

**Flow:** build the container here -> its first QNAP run generates the real v2.0
snapshot and commits it on this branch -> `git merge --ff-only` this branch back
into `feat/astro-rewrite` -> astro-rewrite finishes (Netlify branch deploy,
`/code-review`, merge to `main`).

## Problem

The v2.0 data pipeline -- `scan-nas.mjs` -> `make-thumbnails.mjs` ->
`build-filter-index.mjs` -- runs on a laptop that reaches the NAS only over
SMB-over-VPN. Every run pays for ~13,000 network round trips (readdir + config
reads + stat) plus ~4,000 full-res image pulls. Measured 2026-09: a full scan is
~40 min and wildly variable; `make-thumbnails` is hours; transient SMB failures
silently corrupted a run (~3,000 reachable models marked imageless before the
resilience fixes in `dd8abee`).

The data doesn't change on the laptop -- it changes on the NAS. The pipeline
belongs there: local disk, zero round trips, the whole thing in seconds to a
few minutes.

## Not in scope

- **Upstream download automation** (getting subscription ZIPs past creator login
  walls). That is `orynt3d-pipeline`'s problem -- see its CLAUDE.md "v3 download
  automation". This spec starts from "the NAS already has the organized
  `3D Files` tree".
- Changing what the three scripts *do*. They are already parameterised
  (`scan-nas.mjs --out`, `build-filter-index.mjs --raw`); `make-thumbnails.mjs`
  needs `--thumbs-dir` / `--detail-dir` flags added (~10 lines). No logic change.

## Environment (confirmed 2026-09-02)

- **Host:** QNAP TVS-872XT -- Intel Core i5-8400T, **x86_64**, 6 cores.
- **Container Station** enabled; owner works via `docker compose` + SSH, not the GUI.
- `3D Files` is a **share on the QNAP** -- a local filesystem path inside the NAS
  (exact path TBD, typically `/share/CACHEDEV1_DATA/<share>/3D Files`).
- Owner is the **only committer** to this repo. Force-push to `main` is
  acceptable (guarded with `--force-with-lease`).
- Repo is public; committing ~4k creator preview renders is accepted (they are
  public storefront marketing material; the STLs are never published).

## Design

### Container

- Base `node:22-slim` (Debian, x86_64). `npm ci` -> `sharp` pulls its
  linux-x64 prebuilt, no build toolchain needed.
- Contains only what the pipeline needs: `scripts/`, `src/lib/model-resolve.mjs`,
  `package.json` + lockfile, `git`. Not the Astro app.
- **`3D Files` bind-mounted read-only** at a known path; `ORYNT3D_DIR` points at it.
- A **work dir volume** holds the git checkout between runs (so it's an
  incremental `git fetch` + `git reset`, not a fresh clone each time).

### Entrypoint (`nas-refresh.sh`)

```
git fetch origin main
git reset --hard origin/main
# drop the previous data-snapshot commit if it's at the tip:
if last commit subject matches "chore(data): snapshot"; then git reset --hard HEAD~1; fi

node scripts/scan-nas.mjs                       # ORYNT3D_DIR = the bind mount
#   -> exits non-zero + "INCOMPLETE" if any dir was unreadable: abort, don't commit
node scripts/make-thumbnails.mjs                # local disk -- fast
node scripts/build-filter-index.mjs             # pure

git add -A
git commit -m "chore(data): snapshot $(date -I) (<N> models, <M> without render)"
git push --force-with-lease origin main
```

Exactly one `chore(data): snapshot` commit at the tip, moving forward. Code
commits underneath are untouched. When code is pushed to `main`, the next
refresh run re-parents its snapshot commit onto the new tip automatically
(the `git reset --hard HEAD~1` + fresh commit).

### Trigger

- **v1:** manual -- `docker compose run --rm nas-refresh` over SSH.
- **later:** a cron entry in the container, or QNAP's scheduler. Guard against
  running while `orynt3d-pipeline` is mid-write (a lock file the pipeline
  touches, or a quiet-period check on the `3D Files` mtime).

### Credentials

- A GitHub **fine-grained PAT**, scoped to this repo only, `contents: write`.
- Passed as a Docker secret / `--env-file` (never committed). `git` configured
  with `url."https://x-access-token:${PAT}@github.com/".insteadOf`.

## Open questions

| # | Question | Notes / leaning |
|---|---|---|
| C1 | ~~WebP storage: git or a bucket?~~ **RESOLVED 2026-09-02: git for v1.** Owner accepts the render-commit risk (public storefront marketing images; STLs never published) and repo-size growth for now. Keeps the container simple -- no bucket, no `<img src>` changes. R2 stays a documented later optimization; add a scheduled `git gc` and expect an eventual `git filter-repo`/BFG pass. | git |
| C2 | Incremental scan (per-subscription mtime skip)? NAS-local it matters less (a full scan is minutes not 40 min), but still nice for a cron job. | Build it here rather than on `feat/astro-rewrite` -- it's a NAS-side optimization. `--full` flag to force. |
| C3 | Manual trigger only for v1, or wire cron immediately? | Manual for v1; prove the loop first. |
| C4 | Keep `dev-bootstrap-raw.mjs` + the VPN `npm run data` path working as a fallback? | Yes -- keep both. The container is the primary path; the laptop path stays for when the NAS/container is down. |
| C5 | Does the container also run `astro build` + deploy, or just push data and let Netlify's pull hook build? | **Just push data.** Netlify's existing GitHub pull hook rebuilds on push to `main`. Container stays single-purpose. |

## Testing

**Locally (~80%):**
- `docker build` succeeds; `npm ci` + `sharp` resolve for linux-x64.
- Run the three scripts in the container against `tests/fixtures/build-nas-fixture.mjs`
  (or a small copied tree) -- same assertions as the existing suites.
- The entrypoint git flow against a throwaway local bare repo: verify the
  snapshot-commit re-parenting, `--force-with-lease`, abort-on-INCOMPLETE.

**On the QNAP (~20%):**
- Bind-mount the real share, confirm `ORYNT3D_DIR` reads it as a local path.
- Full run: wall-clock time, sharp throughput on the i5, permissions on the
  work volume, the actual `git push` with the real PAT.
- Container Station / `docker compose` specifics on QNAP's Docker.

## Build order

1. `make-thumbnails.mjs` -- add `--thumbs-dir` / `--detail-dir` / `--models`
   flags (+ tests) so it can run fully NAS-local. Same for a `--out` sanity
   check on the other two (`scan-nas.mjs` already has `--out`,
   `build-filter-index.mjs` has `--raw`; add `--out-dir` there).
2. `Dockerfile` + `compose.nas.yml` + `scripts/nas-refresh.sh` (the entrypoint).
3. Local test pass: `docker build`; run the three scripts in the container
   against `tests/fixtures/build-nas-fixture.mjs`; the git flow
   (fetch/reset/re-parent/`--force-with-lease`/abort-on-INCOMPLETE) against a
   throwaway bare repo.
4. Deploy to the QNAP: bind-mount the real share, first real run, capture
   wall-clock + sharp throughput. **This run produces the v2.0 snapshot.**
5. Commit the snapshot on this branch; `git merge --ff-only` back into
   `feat/astro-rewrite`.
6. C2 incremental scan (per-subscription mtime skip, `--full` to force).
7. C3 cron, once the manual loop is proven.

## Relationship to the other specs

- `docs/nas-scan-spec.md` (Locked) -- the scanner this container runs.
- `docs/astro-rewrite-spec.md` D7 -- the pipeline diagram; this container is the
  production implementation of "run `npm run data`, commit the outputs". D7's
  wording should get a pointer here once this is Locked.
