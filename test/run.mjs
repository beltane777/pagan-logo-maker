#!/usr/bin/env node
/**
 * @file test/run.mjs
 * @description Test entry point — `npm test`.
 *
 * Bundles the renderer once, then runs every `*.test.mjs` suite in a child
 * process. Each suite gets a fresh jsdom, so a crash in one cannot poison the
 * next, and a non-zero exit code from any suite fails the run.
 *
 * Flags:
 *   --engine-only   run only the canvas engine suite
 *   --ui-only       run only the React shell suite
 *   --no-build      reuse the existing `test/.build/app.mjs`
 *
 * Why a child process per suite: jsdom + Fabric leave process-global state
 * (canvas prototypes are patched for headless rasterisation), and React refuses
 * to mount twice into the same document.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const argv = new Set(process.argv.slice(2));

/** @type {Array<{name: string, file: string, needsBundle: boolean}>} */
const SUITES = [
  { name: 'engine', file: 'test/engine.test.mjs', needsBundle: false },
  { name: 'ui', file: 'test/ui.test.mjs', needsBundle: true },
];

const selected = SUITES.filter((s) =>
  argv.has('--engine-only') ? s.name === 'engine' : argv.has('--ui-only') ? s.name === 'ui' : true,
);

const bundlePath = path.join(HERE, '.build', 'app.mjs');

if (!argv.has('--no-build') && selected.some((s) => s.needsBundle)) {
  console.log('▸ bundling renderer…');
  const build = spawnSync(process.execPath, ['test/build.mjs'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('✗ renderer bundle failed — aborting');
    process.exit(1);
  }
} else if (!fs.existsSync(bundlePath) && selected.some((s) => s.needsBundle)) {
  console.error('✗ test/.build/app.mjs is missing — run `npm run test:build`');
  process.exit(1);
}

const started = Date.now();
/** @type {string[]} */
const failed = [];

for (const suite of selected) {
  console.log(`\n── ${suite.name} ─────────────────────────────────────────`);
  const result = spawnSync(
    process.execPath,
    ['--import', './test/loader.mjs', suite.file],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) failed.push(suite.name);
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${'─'.repeat(52)}`);
if (failed.length) {
  console.error(`✗ ${failed.join(', ')} failed in ${seconds}s`);
  process.exit(1);
}
console.log(`✓ all suites passed in ${seconds}s`);
