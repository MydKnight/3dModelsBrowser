# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

3dModelsBrowser is a Next.js static web app that serves as a searchable gallery for a personal 3D model collection. It reads metadata produced by Orynt3D (the desktop cataloguing app) and makes it browsable from anywhere via Netlify.

**Personal tool** — the repo contains only app code. No model data or preview images are committed; these are generated locally from the NAS at build time.

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

- Gallery, filtering, and copy-link features are working
- Mobile layout is responsive
- Static export and Netlify deployment are configured
- Netlify deployment may have gone stale (last commit May 2025) — check Netlify dashboard before assuming it's live

## Known Gaps

- No tests
- No `.env.example` (NAS path is hardcoded in `extract-model-data.js` as `ORYNT3D_DIR` env var — should be documented)
- `package.json` name is `model-data-population-application` — consider updating to `3d-models-browser`
- Should add an `orynt3d-data.example.json` with a few sample entries so the data shape is documented in the repo
- Build pipeline has no fallback for missing NAS — fails hard rather than gracefully

## Next Actions

1. Add `orynt3d-data.example.json` with 2–3 sample model entries to document the data contract
2. Add `ORYNT3D_DIR` to a `.env.example` (or document it in README setup instructions)
3. Verify Netlify deployment is still live; reconnect/redeploy if stale
4. Update `package.json` name field
5. Evaluate: does the `deploy.js` script do anything Netlify's pull hook doesn't handle automatically?

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
