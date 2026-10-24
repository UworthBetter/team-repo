import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative paths: dist/ works from any folder, USB stick or static host.
  base: './',
  resolve: {
    alias: {
      '@contracts': fileURLToPath(new URL('./src/contracts', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
});
