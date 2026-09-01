// astro.config.mjs
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// v2.0 rewrite -- see docs/astro-rewrite-spec.md
// Static site (default output). Netlify builds this with zero NAS access:
// npm run data (local, NAS-reachable) produces the committed src/data/*.json +
// public/thumbnails|detail before this ever runs.
// Gallery/detail images are pre-generated WebP by scripts/extract-model-data.js
// (spec D6) and referenced with plain <img src>. We deliberately never import
// them through astro:assets, so no image-service config is needed here --
// don't add <Image>/getImage() usage without re-reading D6 first.
export default defineConfig({
  output: 'static',
  integrations: [preact()],
});
