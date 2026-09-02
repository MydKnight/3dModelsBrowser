# 3D Models Browser

A searchable static gallery for a personal 3D-print model collection (~3,900
models across 8 subscription lines). Reads metadata that the Orynt3D desktop app
writes per model and makes it filterable from anywhere.

## Current Status

**Active -- v2.0 (Astro) shipped 2026-09-02.**

| Component | Status |
|---|---|
| Filter island (search, sort, AND/OR tags, live per-facet counts) | ✅ |
| Windowed results grid (bounded DOM at ~4k models) | ✅ |
| Static per-model detail pages + View Transitions | ✅ |
| Data pipeline (NAS scan -> WebP thumbnails -> filter index) | ✅ runs in a Docker container on the QNAP |
| Tests | 140 (Vitest) |
| Visual polish | Phase 2 -- functional, not pretty |

Design docs: `docs/astro-rewrite-spec.md` (with a **Phase 2 backlog**),
`docs/nas-scan-spec.md`, `docs/nas-container-spec.md`.

**Personal tool.** No model files are published (that would be the legal issue) --
only the creators' public preview renders, resized to WebP.

**Pipeline context:** `orynt3d-pipeline` -> Orynt3D desktop -> **this app**.

## Tech Stack

- **Astro 7** static site + one **Preact + `@preact/signals`** island (`client:load`)
- Bitset filter engine (`Uint32Array` per tag/sub/release, SWAR popcount for facet counts)
- Hand-rolled row windowing over a unit-tested layout module
- **`sharp`** for WebP thumbnails (400 px grid / 900 px detail) -- run in the pipeline, not at build
- **Vitest** + `@testing-library/preact`
- **Netlify** -- `npm run build` = `astro build` only, reads the committed snapshot, no NAS

## How the data works

`src/data/filter-index.json` + `details.json` and `public/thumbnails|detail/*.webp`
are a **committed snapshot**. Netlify builds from it. To refresh it, the QNAP
container walks the `3D Files` share locally, regenerates everything, and pushes
one `chore(data): snapshot` commit -- see `docker/README.md`. A slower
laptop-over-VPN fallback is `npm run data`.

## Setup

```sh
npm install
npm run dev        # astro dev -> http://localhost:4321
npm test
npm run build && npm run preview   # production build, served locally
```

## Roadmap

`docs/astro-rewrite-spec.md` -> **Phase 2 backlog**: styling pass, detail-page
CLS fix, two-level tag grouping, incremental scan, container cron, moving WebP
to an R2 bucket.

## License

ISC

## Author

MydKnight