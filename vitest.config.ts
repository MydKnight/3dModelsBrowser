import { getViteConfig } from 'astro/config';

// Runs Vitest inside Astro's Vite pipeline so aliases/env match the app.
// docs/astro-rewrite-spec.md -> Testing.
export default getViteConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,mjs}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Per-directory thresholds land as real modules are added in build-order
      // steps 3-7 (docs/astro-rewrite-spec.md -> Testing / Test Coverage Standard
      // in CLAUDE.md). Nothing to gate yet at scaffold stage.
    },
  },
});
