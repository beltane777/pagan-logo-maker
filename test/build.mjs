#!/usr/bin/env node
/**
 * @file test/build.mjs
 * @description Bundles the renderer for headless testing.
 *
 * The app is bundled with Vite, which understands `import.meta.glob`, CSS
 * imports and JSX. Node does not. esbuild handles the last two, and this script
 * swaps the one Vite-specific module (`assetLibrary.js`) for a `fs`-based stub.
 *
 * Output: `test/.build/app.mjs` (git-ignored).
 */

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('test/.build/app.mjs');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

await esbuild.build({
  entryPoints: ['src/renderer/App.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  outfile: OUT,
  loader: { '.js': 'jsx', '.json': 'json', '.css': 'empty' },
  plugins: [
    {
      name: 'test-stubs',
      setup(build) {
        // `import.meta.glob` only exists inside Vite.
        build.onResolve({ filter: /assetLibrary$/ }, () => ({
          path: path.resolve('test/asset-library.stub.js'),
        }));
      },
    },
  ],
  // Keep these external so React and Fabric are shared with the test process.
  external: [
    'jsdom',
    '@napi-rs/canvas',
    'fabric',
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'zustand',
  ],
  logLevel: 'warning',
});

console.log(`✔ bundled renderer → ${path.relative(process.cwd(), OUT)}`);
