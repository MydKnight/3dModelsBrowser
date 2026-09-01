# 3D Models Browser

A web application for browsing and viewing 3D model collections. This application allows users to browse through a library of 3D models with preview images and metadata.

## Current Status

**Active -- v2.0 Astro rewrite in progress (started 2026-09-01).**

The Next.js implementation works but does not scale to the real collection size (~4,000 models, growing ~100/month): the gallery renders every card at once (poor on mobile) and the filter payload ships full metadata for every model. It is being replaced with an Astro build whose focus is a performant filter/tag experience at 4k+ models (bitset result sets, live per-facet tag counts, windowed grid). See `docs/astro-rewrite-spec.md`.

| Component | Status |
|---|---|
| Next.js gallery (browse, filter, copy link) | Working -- being replaced |
| Mobile-responsive layout | Working -- grid does not scale to 4k models |
| Static export + Netlify deployment | Configured (deploy may be stale) |
| `extract-model-data.js` (NAS -> JSON) | Working -- reused as-is in v2.0 |
| Astro v2.0 | Spec drafted, no code yet |
| Tests | None -- TDD stands up with the rewrite |

**This is a personal tool.** A stale data snapshot and preview images are committed from before `.gitignore` was tightened; fresh data is generated locally from a NAS. To deploy your own instance, set up your own Netlify site pointed at your fork.

**Pipeline context:** Downstream end of a 3-stage pipeline: `orynt3d-pipeline` -> Orynt3D desktop app -> this app.

## Features

- Browse through a comprehensive collection of 3D models
- View model images with associated metadata
- Responsive design for desktop and mobile viewing
- Fast performance with Next.js

## Technology Stack

- **Current**: Next.js 15 + React 19, static export (`output: 'export'`)
- **v2.0 (in progress)**: Astro static site + a single Preact/`@preact/signals` island for search/filter/grid; Vitest for tests
- **Deployment**: Netlify (push to `main` = auto-deploy)

## Roadmap

- **v2.0 -- Astro rewrite** (`docs/astro-rewrite-spec.md`): lean dictionary-encoded filter index, bitset filter engine with live tag facet counts, windowed grid, per-model detail pages, NAS-free Netlify build. In progress.

## Project Structure

- `/pages`: Next.js page components
- `/public`: Static assets
  - `/public/images`: Model preview images
  - `/public/orynt3d-data.json`: Model metadata
- `/scripts`: Build and deployment scripts
- `/example configs`: Configuration examples for models and releases

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/MydKnight/3dModelsBrowser.git
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the development server:
   ```
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

### Building for Production

```
npm run build
```

## Deployment

This project is configured for deployment on Netlify. See the Netlify configuration in `netlify.toml`.

## License

ISC

## Author

MydKnight