/**
 * @file src/renderer/lib/finishes.js
 * @description Material "finish" engine. A finish is a reusable recipe that
 * repaints vector artwork with a metal, stone or ink treatment:
 *
 *   • `gold`    — antique gold gradient with a specular sheen
 *   • `copper`  — hammered copper, warm and mottled
 *   • `silver`  — polished silver with a cool highlight
 *   • `stone`   — mossy stone, desaturated with a green cast
 *   • `ember`   — heated iron / forge glow
 *   • `ink`     — flat single colour (used for engraving-style exports)
 *
 * Finishes work on raw SVG markup by nulling every `stroke`/`fill` and injecting
 * a `<linearGradient>`, so a single artwork file can be recoloured instantly
 * without a bitmap round-trip. This keeps exports vector-crisp at 4K.
 *
 * @see docs — architecture note in README (Finishes section)
 */

/** @typedef {{id: string, label: string, group: string, stops: Array<[number,string]>, sheen: number, flat?: string}} Finish */

/**
 * Built-in finish definitions. `stops` drive the linear gradient; `sheen` is the
 * opacity of the diagonal specular overlay (0–1).
 * @type {Finish[]}
 */
export const FINISHES = [
  {
    id: 'gold',
    label: 'Antique Gold',
    group: 'Metals',
    stops: [
      [0, '#f7e7a8'],
      [0.22, '#d9b45c'],
      [0.45, '#a87c2c'],
      [0.6, '#f2dd9b'],
      [0.78, '#b8892f'],
      [1, '#7c5a18'],
    ],
    sheen: 0.36,
  },
  {
    id: 'gold-dark',
    label: 'Burnt Gold',
    group: 'Metals',
    stops: [
      [0, '#c9a24a'],
      [0.3, '#8f6d20'],
      [0.55, '#4a3410'],
      [0.72, '#b8912f'],
      [1, '#5c4315'],
    ],
    sheen: 0.28,
  },
  {
    id: 'copper',
    label: 'Hammered Copper',
    group: 'Metals',
    stops: [
      [0, '#f0b789'],
      [0.25, '#c46a3b'],
      [0.5, '#7e3417'],
      [0.68, '#d98a58'],
      [0.86, '#8f3f1d'],
      [1, '#4d1f0d'],
    ],
    sheen: 0.42,
  },
  {
    id: 'silver',
    label: 'Polished Silver',
    group: 'Metals',
    stops: [
      [0, '#ffffff'],
      [0.24, '#cfd6dd'],
      [0.46, '#7d8794'],
      [0.62, '#eef3f8'],
      [0.8, '#9aa4b1'],
      [1, '#5a626d'],
    ],
    sheen: 0.5,
  },
  {
    id: 'bronze',
    label: 'Aged Bronze',
    group: 'Metals',
    stops: [
      [0, '#d9b98a'],
      [0.3, '#9c7440'],
      [0.55, '#5b4227'],
      [0.75, '#8a6a3d'],
      [1, '#3a2a17'],
    ],
    sheen: 0.3,
  },
  {
    id: 'stone',
    label: 'Mossy Stone',
    group: 'Stones',
    stops: [
      [0, '#b9c0b2'],
      [0.28, '#7e8878'],
      [0.52, '#4c5548'],
      [0.72, '#8b9481'],
      [0.9, '#5b6650'],
      [1, '#2c3329'],
    ],
    sheen: 0.18,
  },
  {
    id: 'granite',
    label: 'Cold Granite',
    group: 'Stones',
    stops: [
      [0, '#c3c6cb'],
      [0.35, '#797f88'],
      [0.6, '#41464e'],
      [0.82, '#6d737c'],
      [1, '#23262b'],
    ],
    sheen: 0.22,
  },
  {
    id: 'ember',
    label: 'Forge Ember',
    group: 'Fires',
    stops: [
      [0, '#ffd9a0'],
      [0.2, '#ff9a3c'],
      [0.45, '#c4301a'],
      [0.62, '#ffb347'],
      [0.8, '#8c2b1a'],
      [1, '#3b0f08'],
    ],
    sheen: 0.45,
  },
  {
    id: 'blood',
    label: 'Dried Blood',
    group: 'Inks',
    stops: [
      [0, '#c04a4a'],
      [0.4, '#8c2b32'],
      [0.7, '#5c1a20'],
      [1, '#33090d'],
    ],
    sheen: 0.16,
  },
  {
    id: 'moss',
    label: 'Forest Moss',
    group: 'Inks',
    stops: [
      [0, '#a8c191'],
      [0.35, '#6f8f5f'],
      [0.65, '#3e5434'],
      [1, '#1d2818'],
    ],
    sheen: 0.2,
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    group: 'Inks',
    stops: [
      [0, '#5a5566'],
      [0.4, '#2a2632'],
      [0.75, '#121016'],
      [1, '#050408'],
    ],
    sheen: 0.55,
  },
  {
    id: 'parchment',
    label: 'Parchment Ink',
    group: 'Inks',
    stops: [
      [0, '#fbf3d8'],
      [0.5, '#efe3c6'],
      [1, '#cdbb92'],
    ],
    sheen: 0.1,
  },
  {
    id: 'flat-gold',
    label: 'Flat Gold',
    group: 'Flat',
    flat: '#d4af4f',
    stops: [[0, '#d4af4f'], [1, '#d4af4f']],
    sheen: 0,
  },
  {
    id: 'flat-black',
    label: 'Flat Black',
    group: 'Flat',
    flat: '#0d0c10',
    stops: [[0, '#0d0c10'], [1, '#0d0c10']],
    sheen: 0,
  },
  {
    id: 'flat-white',
    label: 'Flat White',
    group: 'Flat',
    flat: '#f7f5ef',
    stops: [[0, '#f7f5ef'], [1, '#f7f5ef']],
    sheen: 0,
  },
];

/** Fast lookup map. @type {Map<string, Finish>} */
export const FINISH_MAP = new Map(FINISHES.map((f) => [f.id, f]));

/**
 * Look up a finish by id, falling back to antique gold.
 * @param {string|undefined} id
 * @returns {Finish}
 */
export const getFinish = (id) => FINISH_MAP.get(id) || FINISH_MAP.get('gold');

/**
 * A CSS `linear-gradient()` string approximating a finish, for swatches,
 * layer thumbnails and the properties panel preview.
 * @param {string} id
 * @param {number} [angle] degrees
 * @returns {string}
 */
export function finishToCss(id, angle = 135) {
  const finish = getFinish(id);
  const stops = finish.stops.map(([offset, color]) => `${color} ${Math.round(offset * 100)}%`).join(', ');
  return `linear-gradient(${angle}deg, ${stops})`;
}

/** Monotonic counter so each recoloured SVG gets a unique gradient id. */
let uid = 0;

/** Matches the `fill="none" stroke="#..."` wrapper our library emits. */
const STROKE_WRAPPER = /<g[^>]*fill="none"[^>]*>/i;

/**
 * Decide how a finish should be applied to a given artwork.
 *
 * Our bundled library draws everything as strokes inside a
 * `<g fill="none" stroke="…">` wrapper, but user-imported SVGs are usually
 * filled shapes. Rather than guess per-path, we detect the wrapper once and
 * paint the whole document accordingly.
 *
 * @param {string} svgText
 * @returns {'stroke'|'fill'}
 */
export function detectPaintMode(svgText) {
  return STROKE_WRAPPER.test(svgText) ? 'stroke' : 'fill';
}

/**
 * Repaint raw SVG markup with a material finish.
 *
 * The transformation is deliberately conservative and lossless:
 *   1. Strip existing `<stroke>`/`<fill>` colours (but keep `fill="none"`, which
 *      is structural — it is what makes a stroked glyph hollow).
 *   2. Emit one `<g>` that paints the whole document with the finish gradient.
 *   3. Emit a second, identical `<g>` painted with a diagonal white gradient at
 *      low opacity to fake a specular sheen on the material.
 *
 * Because the artwork stays as vector paths, exports remain crisp at any size.
 *
 * @param {string} svgText raw SVG source
 * @param {string} finishId finish id, see {@link FINISHES}
 * @param {{mode?: 'auto'|'stroke'|'fill', opacity?: number, sheen?: boolean}} [opts]
 * @returns {string} recoloured SVG source
 */
export function applyFinish(svgText, finishId, opts = {}) {
  const finish = getFinish(finishId);
  const gid = `plm-finish-${++uid}`;
  const sheenId = `${gid}-sheen`;
  const { opacity = 1, sheen = true } = opts;
  const mode = opts.mode && opts.mode !== 'auto' ? opts.mode : detectPaintMode(svgText);

  let body = String(svgText)
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    // Drop colour declarations but keep structural `fill="none"`.
    .replace(/\s(stroke|fill)="(?!none)[^"]*"/g, '')
    .replace(/\sstyle="([^"]*)"/g, (_m, css) =>
      ` style="${css.replace(/(^|;)\s*(stroke|fill)\s*:[^;]*/g, '$1')}"`,
    );

  const openMatch = body.match(/<svg[^>]*>/);
  const viewBox = (openMatch?.[0].match(/viewBox="([^"]+)"/) || [, '0 0 256 256'])[1];
  const strokeWidth = (openMatch?.[0].match(/stroke-width="([^"]+)"/) || [, null])[1];

  body = body
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    // The document wrapper would re-impose `fill="none"` on filled children.
    .replace(/<g[^>]*>/g, '')
    .replace(/<\/g>/g, '')
    .trim();

  const gradient = `<defs>
  <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
    ${finish.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}
  </linearGradient>
  <linearGradient id="${sheenId}" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/>
    <stop offset=".42" stop-color="#fff" stop-opacity="${finish.sheen}"/>
    <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
</defs>`;

  const paint = `url(#${gid})`;
  const widthAttr = strokeWidth ? ` stroke-width="${strokeWidth}"` : ' stroke-width="6"';
  const lineStyle = ` stroke-linecap="round" stroke-linejoin="round"`;

  /**
   * One painted copy of the artwork.
   * @param {string} fillPaint
   * @param {string} strokePaint
   * @param {number} alpha
   */
  const layer = (fillPaint, strokePaint, alpha) =>
    `<g fill="${fillPaint}" stroke="${strokePaint}"${widthAttr}${lineStyle} opacity="${alpha}">${body}</g>`;

  const painted =
    mode === 'stroke'
      ? // Stroked artwork: colour the strokes, leave `fill="none"` elements hollow.
        layer('none', paint, opacity)
      : // Filled artwork: colour the fills, and any explicit strokes too.
        layer(paint, paint, opacity);

  const sheenLayer =
    sheen && finish.sheen > 0
      ? mode === 'stroke'
        ? layer('none', `url(#${sheenId})`, 1)
        : layer(`url(#${sheenId})`, `url(#${sheenId})`, 1)
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="256" height="256">${gradient}${painted}${sheenLayer}</svg>`;
}

/**
 * Replace a single colour in raw SVG markup — used by the fill/stroke pickers
 * when the user wants a flat custom colour rather than a preset finish.
 * @param {string} svgText
 * @param {string} color hex/rgb colour
 * @returns {string}
 */
export function paintFlat(svgText, color) {
  return String(svgText)
    .replace(/(stroke|fill)="(?!none)([^"]*)"/g, (_m, attr) => `${attr}="${color}"`);
}

/**
 * Serialise a finish as a data URL usable as an `<img>` source or Fabric
 * pattern. SVG is URL-encoded rather than base64'd to stay inspectable.
 * @param {string} svgText
 * @returns {string}
 */
export function svgToDataUrl(svgText) {
  const encoded = encodeURIComponent(svgText)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
