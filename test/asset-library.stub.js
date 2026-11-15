/**
 * @file test/asset-library.stub.js
 * @description Test-only stand-in for `src/renderer/lib/assetLibrary.js`.
 *
 * The real module resolves SVGs through Vite's `import.meta.glob` and the
 * Electron preload bridge — neither exists under Node. This stub mirrors the
 * public API exactly but reads from disk via `fs`, which keeps the tests fast
 * and deterministic. Wired up in `test/build.mjs`.
 */

import fs from 'node:fs';
import path from 'node:path';
import manifest from '../src/renderer/assets/library.json' with { type: 'json' };

/**
 * Repository root. Resolved from the working directory rather than
 * `import.meta.url` because this module is bundled, which inlines the URL of the
 * *bundle* rather than of this file. Tests always run from the repo root.
 */
const ROOT = process.cwd();

/** @returns {typeof manifest.groups} */
export function getGroups() {
  return manifest.groups;
}

/** Flat list of every bundled asset. */
export function getAllAssets() {
  return manifest.groups.flatMap((g) => g.items);
}

/**
 * @param {string} query
 */
export function searchAssets(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return manifest.groups;
  return manifest.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.id.includes(q) || i.tags.some((t) => t.includes(q)),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** @param {{path: string}} item */
export async function loadAssetSvg(item) {
  return fs.promises.readFile(path.join(ROOT, item.path), 'utf8');
}

/** @param {object} item */
export async function loadAsset(item) {
  return { ...item, svg: await loadAssetSvg(item) };
}

/**
 * @param {string} svg
 * @param {string} [tint]
 */
export function svgThumb(svg, tint) {
  const painted = tint ? svg.replace(/(stroke|fill)="(?!none)[^"]*"/g, `$1="${tint}"`) : svg;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(painted)}`;
}

export function libraryStats() {
  const items = getAllAssets();
  return { total: items.length, groups: manifest.groups.length };
}

export { manifest };
