# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

3dModelsBrowser is a static web app that serves as a searchable gallery for a personal 3D model collection. It reads metadata produced by Orynt3D (the desktop cataloguing app) and makes it browsable from anywhere via Netlify.

**Personal tool.** The repo currently commits a data snapshot (`public/orynt3d-data.json`, ~944 models) and preview images (`public/images/`, ~1599 files) that were tracked before `.gitignore` was tightened -- these are stale but real. Fresh data is generated locally from the NAS.

## Status: v2.0 Astro rewrite (Active, started 2026-09-01)

The Next.js implementation is being replaced with Astro. Reasons: the unvirtualized grid is poor on mobile at the real collection size (~4k models, +100/month), the filter payload ships full metadata for every model, and the `STATIC_DATA_PLACEHOLDER` base64-env-var data embed is a hack that also blocks Netlify CI (NAS unreachable from the build).

**The rewrite's center of gravity is the filter/tag island performance at 4k+ models** -- bitset-based result-set computation and live per-facet tag counts, plus a windowed grid. Build time and bundle size are explicitly not the concern.

Full design: **`docs/astro-rewrite-spec.md`** (Status: Draft). Do not build ad hoc -- lock the spec's open questions first.

Work happens on `feat/astro-rewrite` with a Netlify branch deploy for preview; production stays on the old build until merge.

## Where This Lives in the Pipeline

```
Raw subscription downloads
        ↓
  orynt3d-pipeline (reorganizes files into Orynt3D folder structure)
        ↓
  Orynt3D desktop app (scans, previews, writes config.orynt3d per model)
        ↓
  3dModelsBrowser ← this project
  (extract-model-data.cjs reads config.orynt3d files → orynt3d-data.json → Next.js gallery → Netlify)
```

## Architecture (v2.0, in progress on `feat/astro-rewrite`)

```
src/
  pages/
    index.astro          # gallery shell; hosts the filter island (step 5)
    m/[id].astro          # per-model detail page (step 7)
  lib/                    # pure, unit-tested logic (filter-engine, grid-layout, ...)
  data/
    filter-index.json     # COMMITTED lean per-model records for the island (step 3)
    details.json          # COMMITTED full per-model metadata for detail pages (step 3)
scripts/
  scan-nas.mjs            # walks NAS config.orynt3d -> data/raw/models.json (see docs/nas-scan-spec.md)
  make-thumbnails.mjs     # sharp: data/raw/models.json -> public/thumbnails|detail/<id>.webp (400/900px)
  build-filter-index.mjs  # data/raw/models.json -> src/data/*.json  (step 3, no NAS)
  lib/
    recency.cjs           # addedTs / firstSeenTs helpers (D6a)
    model-resolve.mjs     # name/subscription/release/tag/image resolution
    thumbnail-paths.cjs   # dest-path helpers for make-thumbnails
  build-nextjs-app.cjs    # LEGACY Next.js build -- deleted at step 7
data/raw/                 # GITIGNORED working artefacts (models.json)
tests/fixtures/           # build-nas-fixture.mjs -- temp NAS tree for scan tests
public/
  thumbnails/  detail/    # COMMITTED WebP renditions
  images/                 # LEGACY PNGs, git rm --cached at step 7
pages/, next.config.js    # LEGACY Next.js app -- deleted at step 7
```

Full design: **`docs/astro-rewrite-spec.md`** (Locked). NAS-scan replacement:
**`docs/nas-scan-spec.md`** (Locked).

## Tech Stack

- **Astro (static)** + one **Preact + `@preact/signals`** island for search/filter/grid
- **`@tanstack/virtual`** for the virtualized grid
- **`sharp`** (local only) for WebP thumbnail generation
- **Vitest** + `@testing-library/preact` for tests
- **Netlify** — `npm run build` is `astro build` only, reads committed snapshot, never touches the NAS
- No database; no runtime data fetch (data inlined at build)

## Pipeline

```
NAS  -> scan-nas.mjs        -> data/raw/models.json          (gitignored)
     -> make-thumbnails.mjs -> public/thumbnails|detail/*.webp (committed)
     -> build-filter-index.mjs -> src/data/{filter-index,details}.json (committed)
     -> astro build         (no NAS)
```

`npm run data` runs the first three; **commit the outputs** -- that is the snapshot Netlify builds from.

## Current State

- **v2.0 Astro rewrite in progress** on `feat/astro-rewrite`.
  - Step 1 (scaffold): **done** -- Astro + Preact + Vitest, `astro build`/`dev` verified NAS-free.
  - Step 2 (NAS scan): **in progress.** `recency.cjs` + `make-thumbnails.mjs` + `thumbnail-paths.cjs` done and unit-tested; thumbnail generation verified against real images (400/900px WebP). Blocked mid-step by the `extract-model-data.cjs` drift -> replacing it with `scan-nas.mjs` per `docs/nas-scan-spec.md`.
- **Legacy Next.js app:** superseded. `npm run dev:legacy`/`build:legacy` stop working once `extract-model-data.cjs` is deleted (step 2); full removal at step 7.

## Known Gaps

- Tests: only `scripts/lib/**` covered so far (recency, thumbnail-paths). Everything else pending its build-order step.
- No `.env.example` for `ORYNT3D_DIR` (still hardcoded default in the scanner)
- `src/data/filter-index.example.json` not yet created (step 3)
- `public/images/` (588 MB) + `public/orynt3d-data.json` still tracked -- `git rm --cached` at step 7
- The committed `public/orynt3d-data.json` leaks the NAS IP via `sourcePath`; v2.0 artefacts drop it (relPath only)

## Next Actions

Follow `docs/astro-rewrite-spec.md` -> Build order. All on `feat/astro-rewrite`.

1. ~~Step 1 -- scaffold~~ **done**
2. **Step 2 -- NAS scan** (`docs/nas-scan-spec.md`, Locked): fixture tree -> `model-resolve.mjs` (test-first) -> `scan-nas.mjs` -> point `make-thumbnails.mjs` at `data/raw/models.json` -> delete `extract-model-data.cjs` -> gitignore `data/raw/`. Verify NAS subset then full.
3. **Step 3 -- `build-filter-index.mjs`:** tests then impl; `filter-index.json` + `details.json` + `.example.json`; sort newest-first.
4. **Step 4 -- `filter-engine.ts`:** tests (brute-force facet-count reference, AND/OR, sort modes) then impl.
5. **Step 5 -- filter island:** panel + engine wiring + URL sync; component tests.
6. **Step 6 -- windowed grid:** `grid-layout.ts` tests first, then `@tanstack/virtual`.
7. **Step 7 -- detail pages** + delete all Next.js remnants + `git rm --cached -r public/images`.
8. **Steps 8-9:** Netlify branch deploy -> `/code-review` + squash + merge.

No step's code is done until: tests written -> tests passing -> `verify` live functional check, in that order. From-scratch rewrite = no legacy exemption; every new module is test-first.

## Test Coverage Standard

Defined 2026-09-01 with the v2.0 spec (`docs/astro-rewrite-spec.md` -> Testing). Runner: Vitest. Component tests: `@testing-library/preact`.

| Scope | Target |
|---|---|
| `src/lib/**` (filter engine, grid layout, helpers) | 90% lines/branches |
| `scripts/lib/model-resolve.mjs` | 90% |
| `scripts/build-filter-index.mjs` | 85% |
| `scripts/lib/recency.cjs` | 85% (met) |
| Island components | 70% |
| `src/pages/m/[id].astro` `getStaticPaths` | smoke-tested, no numeric target (routing glue) |
| Exempt | `scripts/scan-nas.mjs` + `scripts/make-thumbnails.mjs` (fs/NAS/sharp), `astro.config.mjs`, other `*.astro` pages, legacy `*.cjs` (deleted) |

## Out of Spec

- Tests incomplete -- coverage grows per build-order step (see above)
- Legacy Next.js files (`pages/`, `next.config.js`, `*.cjs`) still present -- deleted at step 7
- `package.json` author field still empty

## Deployment

Netlify builds via GitHub pull hook (push to `main` = auto-deploy). `npm run build` = `astro build` only -- it reads the committed `src/data/*.json` + `public/thumbnails|detail/` snapshot and never contacts the NAS, so the build environment needs nothing special. Refreshing the snapshot (`npm run data`) is a local, NAS-connected step whose outputs are committed.

Branch strategy: `feat/astro-rewrite` gets a Netlify **branch deploy** for preview; production stays on the old build until merge.

## Development

```bash
npm install

# v2.0 (Astro) -- no NAS needed unless refreshing the data snapshot
npm run dev            # astro dev
npm run build           # astro build -- reads the committed snapshot only
npm run test             # vitest run

# Refresh the data snapshot (requires NAS access; commit the result -- spec D7)
$env:ORYNT3D_DIR = "\\192.168.254.200\data\3D Files"
npm run data              # extract-model-data.cjs && build-filter-index.mjs

# Legacy Next.js app (until build-order step 7 removes it)
npm run dev:legacy
npm run build:legacy      # requires NAS access
```
