# NAS Data Container -- Design Spec

**Status:** Draft
**Target:** feat/nas-data-container (a separate feature, branched off `main` after `feat/astro-rewrite` merges)
**Date:** 2026-09-02

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
| C1 | **WebP storage: git or a bucket?** Recommitting ~500 MB of WebP per refresh grows the pack indefinitely (dangling blobs survive until `git gc`; ~6 GB/year of monthly snapshots). Alternative: container uploads WebP to Cloudflare R2, the site references `https://<bucket>/<id>.webp`, git holds only `src/data/*.json` (~1 MB). | **Leaning bucket** for the container era -- it's the clean long-term answer and R2 egress is free. Cost: an `<img src>` base-URL change in `GalleryIsland.tsx` + `[id].astro`, an R2 bucket, and an upload step in the entrypoint. If we stay on git, add a scheduled `git gc --aggressive` and a note that a BFG pass will eventually be needed. |
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

1. `make-thumbnails.mjs` -- add `--thumbs-dir` / `--detail-dir` (+ tests). Small;
   could even land on `feat/astro-rewrite` since it's a pure param addition.
2. Resolve C1 (git vs bucket) -- this shapes the entrypoint and possibly the
   Astro components. Lock before writing the Dockerfile.
3. `Dockerfile` + `compose.nas.yml` + `scripts/nas-refresh.sh`.
4. Local test pass (build, scripts-in-container, git-flow).
5. (If C1 = bucket) R2 bucket + upload step + `<img src>` base URL wired through
   an env var / Astro config.
6. Deploy to the QNAP, first real run, capture timings.
7. C2 incremental scan.
8. C3 cron, once the manual loop is proven.

## Relationship to the other specs

- `docs/nas-scan-spec.md` (Locked) -- the scanner this container runs.
- `docs/astro-rewrite-spec.md` D7 -- the pipeline diagram; this container is the
  production implementation of "run `npm run data`, commit the outputs". D7's
  wording should get a pointer here once this is Locked.
