import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';

/**
 * Renderer build configuration.
 *
 * The renderer is served from {@link RENDERER_ROOT} and bundled to `dist/`,
 * which Electron loads via `loadFile` in production. `base` is relative so the
 * bundle works from the `file://` protocol inside the packaged app.
 */
const RENDERER_ROOT = fileURLToPath(new URL('./src/renderer', import.meta.url));

export default defineConfig({
  root: RENDERER_ROOT,
  base: './',
  plugins: [react()],
  publicDir: 'public',
  css: {
    postcss: {
      plugins: [tailwindcss({ config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) }), autoprefixer()],
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    // The sandbox preview proxies through a wildcard host; allow it.
    allowedHosts: true,
    fs: {
      // Permit reading shared assets + fonts from the repository root.
      allow: [fileURLToPath(new URL('./', import.meta.url))],
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
