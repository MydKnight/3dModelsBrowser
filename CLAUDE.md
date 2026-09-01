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
  (extract-model-data.js reads config.orynt3d files → orynt3d-data.json → Next.js gallery → Netlify)
```

## Architecture

```
pages/
  index.js              # Main gallery page — browse, filter, copy link
scripts/
  extract-model-data.js # Scans NAS for config.orynt3d files → public/orynt3d-data.json
  build-nextjs-app.js   # Copies preview images from NAS, embeds data as env var, runs next build
  deploy.js             # Deployment helper
public/
  orynt3d-data.json     # GITIGNORED — generated locally, not committed
  images/               # GITIGNORED — copied from NAS at build time
example configs/        # Reference config examples
netlify.toml            # Netlify build config (static export via output:export)
next.config.js          # Next.js config
```

## Tech Stack

- **Next.js 15 + React 19** — static export (`output: 'export'`)
- **Netlify** — hosting via Netlify's GitHub pull hook (push to main = auto-deploy)
- **No database** — data embedded as a static JSON file at build time via `STATIC_DATA_PLACEHOLDER` env var

## How the Build Works

The build is not a standard `next build` — it's a two-step process:

1. `scripts/extract-model-data.js` — scans `\\NAS\data\3D Files` for `config.orynt3d` files, copies preview images to `public/images/`, writes `public/orynt3d-data.json`
2. `scripts/build-nextjs-app.js` — reads `orynt3d-data.json`, base64-encodes it into `STATIC_DATA_PLACEHOLDER` env var, then runs `next build`

The `index.js` page reads `STATIC_DATA_PLACEHOLDER` at build time so the data is fully embedded in the static output — no runtime API calls needed.

**Important:** `npm run build` invokes `build-nextjs-app.js`, which expects the NAS to be reachable. Running this without NAS access will fail at the data step.

## Current State

- **Next.js implementation (being replaced):** gallery, filtering, copy-link, responsive layout all work; static export + Netlify configured. Last real commit March 2026. Netlify deploy may be stale -- check the dashboard.
- **Astro v2.0:** spec **Locked** (`docs/astro-rewrite-spec.md`, O1-O6 all resolved 2026-09-01). No code yet. Next step is build-order step 1 (scaffold `feat/astro-rewrite`).

## Known Gaps

- No tests (TDD stands up as part of the v2.0 rewrite -- see spec Testing section)
- No `.env.example` (NAS path is hardcoded in `extract-model-data.js` as `ORYNT3D_DIR` env var -- should be documented)
- `package.json` name is `model-data-population-application` -- rename to `3d-models-browser` during the rewrite scaffold
- No committed example of the data shape -- v2.0 adds `src/data/filter-index.example.json` (spec Data contract section)
- Old Next.js build fails hard without NAS -- v2.0's committed-snapshot pipeline (spec D7) fixes this

## Next Actions

Follow the spec's build order (`docs/astro-rewrite-spec.md` -> Build order). All on `feat/astro-rewrite`.

1. **Step 1 -- scaffold:** Astro + Preact + `@preact/signals` + Vitest, `.gitignore` update, rename `package.json` name to `3d-models-browser`. Old Next.js files stay.
2. **Step 2 -- extract step:** dual WebP thumbnails (`sharp`) + recency fields (`addedTs`, preserved `firstSeenTs`); tests for the merge logic.
3. **Step 3 -- `build-filter-index.mjs`:** tests then impl; emits `filter-index.json` + `details.json` + `filter-index.example.json`.
4. **Step 4 -- `filter-engine.ts`:** tests (brute-force facet-count reference, AND/OR, sort modes) then impl.
5. **Step 5 -- filter island:** panel + engine wiring + URL sync; component tests.
6. **Step 6 -- windowed grid:** tests for `grid-layout.ts` (column math, row mapping, scrollTop round-trip) first, then `@tanstack/virtual` integration.
7. **Step 7 -- detail pages:** test for `getStaticPaths` id/details mapping first, then `/m/[id]`, static shell pages, `<ClientRouter />` + `transition:persist`; delete Next.js remnants and `git rm --cached -r public/images`.
8. **Steps 8-9:** Netlify branch deploy -> `/code-review` + squash + merge.

Every step's code is not marked done until it clears all three verification gates in order: tests written -> tests passing -> `verify` skill's live functional check (per the global spec-sync rule). Since this is a from-scratch rewrite there is no untested-legacy exemption to lean on -- every new module in the build order is test-first.

## Test Coverage Standard

Defined 2026-09-01 with the v2.0 spec (`docs/astro-rewrite-spec.md` -> Testing). Runner: Vitest. Component tests: `@testing-library/preact`.

| Scope | Target |
|---|---|
| `src/lib/**` (filter engine, grid layout, helpers) | 90% lines/branches |
| `scripts/build-filter-index.mjs` | 85% |
| `scripts/extract-model-data.js` -- **only** the new recency-merge logic | 85% |
| Island components | 70% |
| `src/pages/m/[id].astro` `getStaticPaths` | smoke-tested, no numeric target (routing glue) |
| Exempt | legacy NAS scan/walk in `extract-model-data.js`, `scripts/build-nextjs-app.js` (deleted), `astro.config.mjs`, other `*.astro` pages, `deploy.js` |

## Out of Spec

- No tests yet (being addressed in v2.0)
- Source not under `src/` in the Next.js layout (`pages/`, `scripts/`) -- v2.0 Astro layout moves logic into `src/`
- `package.json` name/author/description fields unset or wrong

## Deployment

Netlify is connected to the GitHub repo via pull hook — pushing to `main` triggers a Netlify build automatically. No manual deploy step needed. The Netlify build environment needs `ORYNT3D_DIR` set if the build script reads it from env; otherwise the hardcoded NAS path in the script will be used (which only works on the local machine, not Netlify).

> Note: The current build likely fails on Netlify because the NAS is not reachable from Netlify's build environment. The `build-nextjs-app.js` script may need a "CI mode" that uses a pre-committed data snapshot instead of trying to reach the NAS. This is a known gap to address when reviving.

## Development

```bash
npm install

# Generate data from NAS (requires NAS access)
$env:ORYNT3D_DIR = "\\192.168.254.200\data\3D Files"
node scripts/extract-model-data.js

# Build
npm run build

# Dev server (uses whatever orynt3d-data.json is in public/)
npm run dev
```
