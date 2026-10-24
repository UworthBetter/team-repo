import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative asset paths so dist/ runs from any subfolder, a USB stick or a static host
  // with no server config and no internet (content JSON is bundled in; see docs/WORKFLOW.md §6).
  base: './',
  resolve: {
    alias: {
      '@contracts': fileURLToPath(new URL('./src/contracts', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  // Rapier (wasm) is a deliberately large, lazy-loaded chunk — don't warn on it.
  build: { chunkSizeWarningLimit: 5000 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
});
