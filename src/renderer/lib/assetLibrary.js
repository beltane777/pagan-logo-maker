/**
 * @file src/renderer/lib/assetLibrary.js
 * @description Loader for the bundled offline vector library.
 *
 * Two runtimes are supported:
 *
 *   • **Electron** — the manifest is bundled by Vite as JSON and each SVG is
 *     fetched through the preload bridge (`desktop.library.readSvg`), so the
 *     renderer never needs filesystem access.
 *   • **Browser** (design-time preview) — SVGs are resolved through Vite's
 *     `import.meta.glob` + `?raw`, which is fully static and works offline.
 *
 * Both paths return the same shape: `{ id, name, tags, category, svg }`.
 *
 * @see ../../scripts/generate-assets.mjs — producer of `library.json`
 */

import manifest from '../assets/library.json';

/** Eagerly-imported raw SVG sources — resolved at build time. */
const bundledSources = import.meta.glob('../../../assets/svgs/**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** @type {Map<string, string>} repo-relative path → svg source */
const sourceMap = new Map(
  Object.entries(bundledSources).map(([key, value]) => [
    key.replace(/^.*\/assets\/svgs\//, 'assets/svgs/'),
    value,
  ]),
);

/** Cache of resolved assets, keyed by id. */
const cache = new Map();

/**
 * Full library structure: groups → items (metadata only).
 * @returns {Array<{id:string,label:string,blurb:string,items:Array<object>}>}
 */
export function getGroups() {
  return manifest.groups;
}

/** Flat list of every bundled asset. */
export function getAllAssets() {
  return manifest.groups.flatMap((g) => g.items);
}

/**
 * Filter the library by free-text query across names and tags.
 * @param {string} query
 * @returns {typeof manifest.groups}
 */
export function searchAssets(query) {
  const q = query.trim().toLowerCase();
  if (!q) return manifest.groups;
  return manifest.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.id.includes(q) ||
          item.tags.some((t) => t.includes(q)),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Resolve an asset's SVG source.
 * @param {{id: string, path: string}} item manifest entry
 * @returns {Promise<string>} SVG markup
 */
export async function loadAssetSvg(item) {
  if (cache.has(item.id)) return cache.get(item.id);

  let svg = null;

  // Electron: go through IPC (works inside the asar archive).
  if (window.desktop?.library?.readSvg) {
    const relative = item.path.replace(/^assets\/svgs\//, '');
    const result = await window.desktop.library.readSvg(relative);
    if (result?.svg) svg = result.svg;
  }

  // Fallback: statically bundled source (browser preview / dev server).
  if (!svg) svg = sourceMap.get(item.path) ?? null;

  if (!svg) throw new Error(`Asset not found: ${item.path}`);
  cache.set(item.id, svg);
  return svg;
}

/**
 * Load an asset with its SVG attached.
 * @param {object} item
 * @returns {Promise<{id:string,name:string,svg:string}>}
 */
export async function loadAsset(item) {
  return { ...item, svg: await loadAssetSvg(item) };
}

/**
 * Convert raw SVG markup into a data URL for `<img>` thumbnails.
 * @param {string} svg
 * @param {string} [tint] optional stroke colour override
 * @returns {string}
 */
export function svgThumb(svg, tint) {
  const painted = tint ? svg.replace(/(stroke|fill)="(?!none)[^"]*"/g, `$1="${tint}"`) : svg;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(painted)}`;
}

/**
 * Human-readable count summary for the vault header.
 * @returns {{total: number, groups: number}}
 */
export function libraryStats() {
  const items = getAllAssets();
  return { total: items.length, groups: manifest.groups.length };
}

export { manifest };
