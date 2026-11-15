#!/usr/bin/env node
/**
 * @file scripts/generate-assets.js
 * @description Procedural generator for the bundled, royalty-free vector library
 * shipped with Pagan Logo Maker. Every glyph is constructed from geometry
 * (polar coordinates, arc segments, star polygons) so the library stays crisp at
 * any zoom level, has no binary bloat, and can be recoloured by the renderer.
 *
 * Output:
 *   assets/svgs/<category>/<id>.svg   — one self-contained, offline SVG per asset
 *   src/renderer/assets/library.json  — manifest consumed by the Vault sidebar
 *
 * Design contract for every emitted SVG (relied on by `canvas/finishes.js`):
 *   • viewBox is always `0 0 256 256` and the drawing is centred in the box.
 *   • Recolourable outlines use `fill="none" stroke="#d4af4f"`.
 *   • Recolourable solids carry `data-role="fill"` and `fill="#d4af4f"`.
 *   • Anything with `data-role="keep"` must never be recoloured (e.g. shading).
 *
 * Run with: `node scripts/generate-assets.js`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SVG_OUT = path.join(ROOT, 'assets', 'svgs');
const MANIFEST_OUT = path.join(ROOT, 'src', 'renderer', 'assets', 'library.json');

/* ─────────────────────────── geometry helpers ─────────────────────────── */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const CX = 128;
const CY = 128;
const GOLD = '#d4af4f';

/** Round to 2dp so generated files stay tiny and diff-friendly. */
const n = (v) => Math.round(v * 100) / 100;

/** Polar → cartesian. Angle 0 is east; -90° (i.e. `-Math.PI/2`) is north. */
const P = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

/**
 * Build an SVG path from a list of points.
 * @param {Array<[number,number]>} pts
 * @param {boolean} [closed]
 * @returns {string}
 */
const poly = (pts, closed = false) =>
  'M' + pts.map(([x, y], i) => `${i ? 'L' : ''}${n(x)} ${n(y)}`).join(' ') + (closed ? 'Z' : '');

/** Circle as an SVG element. */
const circle = (cx, cy, r, attrs = '') =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${attrs ? ' ' + attrs : ''}/>`;

/**
 * Circular arc path.
 * @param {number} cx @param {number} cy @param {number} r
 * @param {number} a0 start angle (radians) @param {number} a1 end angle (radians)
 * @param {boolean} [ccw] draw counter-clockwise
 */
const arc = (cx, cy, r, a0, a1, ccw = false) => {
  const [x0, y0] = P(cx, cy, r, a0);
  const [x1, y1] = P(cx, cy, r, a1);
  let sweep = a1 - a0;
  if (ccw) sweep = -Math.abs(sweep);
  const large = Math.abs(sweep) > Math.PI ? 1 : 0;
  return `M${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${large} ${ccw ? 0 : 1} ${n(x1)} ${n(y1)}`;
};

/** Regular n-gon vertices on radius r. */
const ngon = (sides, r, cx = CX, cy = CY, rot = -Math.PI / 2) =>
  Array.from({ length: sides }, (_, i) => P(cx, cy, r, rot + (i * TAU) / sides));

/**
 * Star polygon (e.g. pentagram) as a single self-intersecting path.
 * @param {number} points number of vertices
 * @param {number} step vertex step (2 = pentagram/pentacle, 3 = heptagram)
 */
const star = (points, step, r, cx = CX, cy = CY, rot = -Math.PI / 2) =>
  poly(
    Array.from({ length: points }, (_, i) => P(cx, cy, r, rot + (i * step * TAU) / points)),
    true,
  );

/** Archimedean spiral. */
const spiral = (turns, r0, r1, cx = CX, cy = CY, rot = 0, samples = 220) =>
  poly(
    Array.from({ length: samples + 1 }, (_, i) => {
      const t = i / samples;
      return P(cx, cy, r0 + (r1 - r0) * t, rot + t * turns * TAU);
    }),
  );

/** Logarithmic (golden) spiral — the classic triskele arm. */
const goldenSpiral = (r0, r1, turns, cx = CX, cy = CY, rot = 0, samples = 160) =>
  poly(
    Array.from({ length: samples + 1 }, (_, i) => {
      const t = i / samples;
      return P(cx, cy, r0 * Math.pow(r1 / r0, t), rot + t * turns * TAU);
    }),
  );

/**
 * Crescent moon outline: outer arc of radius `R`, inner (cutting) arc of `r`,
 * both passing through the poles `(cx, cy ± R)`. `flip` mirrors the opening.
 * @param {number} cx @param {number} cy @param {number} R @param {number} r
 * @param {boolean} [flip] open toward -x instead of +x
 * @returns {string} closed path data
 */
const crescent = (cx, cy, R, r, flip = false) => {
  const [sweepOut, sweepIn] = flip ? [0, 1] : [1, 0];
  return `M${n(cx)} ${n(cy - R)}A${n(R)} ${n(R)} 0 1 ${sweepOut} ${n(cx)} ${n(cy + R)}A${n(r)} ${n(
    r,
  )} 0 1 ${sweepIn} ${n(cx)} ${n(cy - R)}Z`;
};

/**
 * One arm of a triquetra knot: an arc of radius `R` whose centre is placed
 * `rad` from the artboard centre at angle `rot`, bulging away from centre.
 * @param {number} R @param {number} rad @param {number} spanDeg @param {number} rot
 */
const knotArc = (R, rad, spanDeg, rot) => {
  const [cx, cy] = P(CX, CY, rad, rot);
  const mid = rot + Math.PI;
  const half = (spanDeg * DEG) / 2;
  return arc(cx, cy, R, mid - half, mid + half);
};

/**
 * Illuminated portion of a lunar phase.
 * @param {number} k illumination in [-1, 1]; negative = waning, |k| = fraction lit.
 * @returns {string} closed path data for the lit region
 */
const moonPhase = (cx, cy, r, k) => {
  const a = Math.min(1, Math.abs(k));
  const sgn = k < 0 ? -1 : 1;
  const rx = r * Math.abs(Math.cos(Math.PI * a));
  const out = sgn > 0 ? 1 : 0;
  const back = a < 0.5 ? 1 - out : out;
  return `M${n(cx)} ${n(cy - r)}A${n(r)} ${n(r)} 0 0 ${out} ${n(cx)} ${n(cy + r)}A${n(rx)} ${n(r)} 0 0 ${back} ${n(
    cx,
  )} ${n(cy - r)}Z`;
};

/** Equilateral triangle pointing up, centred. */
const triangle = (size, cx = CX, cy = CY, rot = -Math.PI / 2) =>
  poly(ngon(3, size, cx, cy, rot), true);

/** Rune stroke set → single multi-subpath (keeps stroke joins tidy). */
const strokes = (segments) =>
  segments.map((s) => poly(s)).join(' ');

/* ──────────────────────────── spline helpers ──────────────────────────── */

/**
 * Catmull-Rom → cubic Bézier conversion. Used for organic shapes (trees,
 * antlers, banners) where hand-tuned control points would be brittle.
 * @param {Array<[number,number]>} pts
 * @param {boolean} [closed]
 */
function smoothPath(pts, closed = false) {
  const p = closed ? [...pts, pts[0]] : pts;
  if (p.length < 2) return '';
  let d = `M${n(p[0][0])} ${n(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

/**
 * Mirrored branch generator — used for trees, wreaths and antlers.
 * @param {Array<[number,number]>} pts points on one side (x measured from axis)
 * @returns {{left: Array<[number,number]>, right: Array<[number,number]>}}
 */
const mirror = (pts) => ({
  left: pts.map(([x, y]) => [CX - (x - CX), y]),
  right: pts,
});

/* ─────────────────────────── SVG document shell ────────────────────────── */

/**
 * Normalise generator markup into valid SVG children.
 *
 * Generators return bare path data (e.g. `M10 10L…`) so they compose nicely;
 * this pass wraps each bare run in a `<path d="…"/>` element and leaves real
 * elements (`<circle …/>`) untouched. Blank lines are dropped.
 *
 * @param {string} markup
 * @returns {string}
 */
function normaliseMarkup(markup) {
  return markup
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('<') ? line : `<path d="${line}"/>`))
    .join('\n');
}

/**
 * Wrap markup in a normalised SVG document.
 * @param {string} inner
 * @param {{background?: string}} [opts]
 */
function doc(inner, opts = {}) {
  if (opts.rawSvg) return opts.rawSvg;
  const bg = opts.background
    ? `<rect width="256" height="256" fill="${opts.background}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
<title>Pagan Logo Maker asset</title>
${bg}<g fill="none" stroke="${GOLD}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
${normaliseMarkup(inner)}
</g>
</svg>
`;
}

/** Solid (filled) path markup that survives the `fill="none"` group wrapper. */
const fillPath = (d) => `<path d="${d}" fill="${GOLD}" stroke="none"/>`;

/* ═══════════════════════════ RUNES — ELDER FUTHARK ══════════════════════
 * Stylised monoline interpretations of the 24 Elder Futhark staves, drawn on a
 * shared 100×100 design grid (24 runes) and then recentred into the 256 box.
 * They are intentionally geometric rather than font-derived so they remain
 * editable paths that the finish engine can recolour.
 */
const RUNE_SCALE = 1.6;
const RUNE_OFFSET = 48;

/** Map a rune-grid point into the 256 viewBox. */
const R = ([x, y]) => [x * RUNE_SCALE + RUNE_OFFSET, y * RUNE_SCALE + RUNE_OFFSET];

/** Rune definition: array of polylines in a 0–100 grid. */
const runePaths = (segs) => strokes(segs.map((s) => s.map(R)));

const RUNES = [
  ['fehu', 'Fehu', [[[40, 8], [40, 92]], [[40, 38], [78, 20]], [[40, 62], [78, 44]]]],
  ['uruz', 'Uruz', [[[38, 8], [38, 92]], [[38, 8], [78, 34]]]],
  ['thursaz', 'Thurisaz', [[[36, 8], [36, 92]], [[36, 34], [76, 22], [76, 52], [36, 40]]]],
  ['ansuz', 'Ansuz', [[[36, 8], [36, 92]], [[36, 8], [76, 28]], [[36, 8], [70, 48]]]],
  ['raido', 'Raido', [[[36, 8], [36, 92]], [[36, 8], [76, 26], [36, 48]], [[36, 48], [76, 88]]]],
  ['kenaz', 'Kenaz', [[[78, 16], [40, 50], [78, 84]]]],
  ['gebo', 'Gebo', [[[32, 16], [72, 84]], [[72, 16], [32, 84]]]],
  ['wunjo', 'Wunjo', [[[34, 8], [34, 92]], [[34, 10], [78, 30], [34, 50]]]],
  ['hagalaz', 'Hagalaz', [[[30, 8], [30, 92]], [[70, 8], [70, 92]], [[30, 50], [70, 50]]]],
  ['nauthiz', 'Nauthiz', [[[54, 8], [54, 92]], [[28, 88], [66, 22]]]],
  ['isa', 'Isa', [[[50, 8], [50, 92]]]],
  ['jera', 'Jera', [[[30, 14], [66, 42], [30, 70]], [[70, 30], [34, 58], [70, 86]]]],
  ['eihwaz', 'Eihwaz', [[[50, 14], [50, 88]], [[50, 14], [74, 6]], [[50, 88], [26, 96]]]],
  [
    'perthro',
    'Perthro',
    [
      [[36, 8], [36, 44]],
      [[76, 8], [76, 44]],
      [[36, 44], [56, 62], [76, 44]],
      [[56, 62], [56, 94]],
    ],
  ],
  ['algiz', 'Algiz', [[[50, 22], [50, 92]], [[50, 22], [20, 6]], [[50, 22], [80, 6]]]],
  ['sowilo', 'Sowilo', [[[70, 6], [40, 44], [66, 50], [34, 94]]]],
  ['tiwaz', 'Tiwaz', [[[50, 6], [50, 92]], [[50, 6], [28, 30]], [[50, 6], [72, 30]]]],
  [
    'berkano',
    'Berkano',
    [
      [[34, 8], [34, 92]],
      [[34, 10], [72, 22], [72, 44], [34, 52]],
      [[34, 52], [72, 64], [72, 88], [34, 96]],
    ],
  ],
  ['ehwaz', 'Ehwaz', [[[30, 92], [30, 12]], [[70, 92], [70, 12]], [[30, 12], [70, 52]]]],
  ['mannaz', 'Mannaz', [[[22, 92], [22, 10], [50, 78], [78, 10], [78, 92]]]],
  ['laguz', 'Laguz', [[[36, 8], [36, 92]], [[36, 8], [76, 50]], [[36, 26], [66, 54]]]],
  ['ingwaz', 'Ingwaz', [ngon(4, 42, 50, 50, -Math.PI / 2)]],
  [
    'dagaz',
    'Dagaz',
    [
      [[26, 14], [26, 86]],
      [[74, 14], [74, 86]],
      [[26, 14], [74, 86]],
      [[74, 14], [26, 86]],
    ],
  ],
  [
    'othala',
    'Othala',
    [
      [[50, 6], [82, 40], [50, 68], [18, 40], [50, 6]],
      [[50, 68], [20, 94]],
      [[50, 68], [80, 94]],
    ],
  ],
];

/* ═════════════════════════ SYMBOLS — THE COLLECTION ═════════════════════ */

/** Each entry: id, name, tags, markup. */
const symbols = [];

for (const [id, name, segs] of RUNES) {
  symbols.push({
    id: `rune-${id}`,
    name,
    tags: ['rune', 'elder futhark', 'stave', 'alphabet'],
    markup: runePaths(segs),
  });
}

/** Push a symbol definition. */
const add = (id, name, tags, markup) => symbols.push({ id, name, tags, markup });

add('triple-moon', 'Triple Moon', ['goddess', 'maiden mother crone', 'lunar', 'wicca'], [
  circle(CX, CY, 108),
  crescent(62, CY, 52, 40, false),
  crescent(194, CY, 52, 40, true),
  circle(CX, CY, 32),
].join('\n'));

add('triple-moon-plain', 'Triple Moon (Open)', ['goddess', 'lunar', 'wicca'], [
  crescent(64, CY, 54, 42, false),
  crescent(192, CY, 54, 42, true),
  circle(CX, CY, 38),
].join('\n'));

add('pentacle', 'Pentacle', ['pentagram', 'five point star', 'wicca', 'protection'], [
  circle(CX, CY, 96),
  star(5, 2, 92),
  circle(CX, CY, 88),
].join('\n'));

add('pentagram', 'Pentagram', ['five point star', 'venus', 'occult'], star(5, 2, 100));

add('heptagram', 'Heptagram', ['seven point star', 'elven star', 'faerie'], [
  star(7, 2, 100),
  circle(CX, CY, 104),
].join('\n'));

add('enneagram', 'Nonagram', ['nine point star', 'nine', 'esoteric'], star(9, 4, 100));

add('hexagram', 'Hexagram', ['six point star', 'solomon', 'alchemy'], [
  poly(ngon(3, 88, CX, CY, -Math.PI / 2), true),
  poly(ngon(3, 88, CX, CY, Math.PI / 2), true),
  circle(CX, CY, 100),
].join('\n'));

add('tree-of-life', 'Tree of Life', ['kabbalah', 'sephiroth', 'world tree'], [
  circle(CX, CY, 106),
  (() => {
    /** Sephiroth centres on a fractional grid, mapped into the artboard. */
    const S = {
      keter: [0.5, 0.12],
      chokhmah: [0.79, 0.25],
      binah: [0.21, 0.25],
      chesed: [0.79, 0.45],
      gevurah: [0.21, 0.45],
      tiferet: [0.5, 0.55],
      netzach: [0.79, 0.72],
      hod: [0.21, 0.72],
      yesod: [0.5, 0.82],
      malkuth: [0.5, 0.96],
    };
    const at = (k) => [40 + S[k][0] * 176, 12 + S[k][1] * 210];
    const links = [
      ['keter', 'chokhmah'], ['keter', 'binah'], ['keter', 'tiferet'],
      ['chokhmah', 'binah'], ['chokhmah', 'chesed'], ['chokhmah', 'gevurah'],
      ['chokhmah', 'tiferet'], ['binah', 'chesed'], ['binah', 'gevurah'],
      ['binah', 'tiferet'], ['chesed', 'gevurah'], ['chesed', 'tiferet'],
      ['chesed', 'netzach'], ['gevurah', 'tiferet'], ['gevurah', 'hod'],
      ['tiferet', 'netzach'], ['tiferet', 'hod'], ['tiferet', 'yesod'],
      ['netzach', 'hod'], ['netzach', 'yesod'], ['netzach', 'malkuth'],
      ['hod', 'yesod'], ['hod', 'malkuth'], ['yesod', 'malkuth'],
    ].map(([a, b]) => poly([at(a), at(b)]));
    return [...links, ...Object.keys(S).map((k) => circle(...at(k), 7))].join('\n');
  })(),
].join('\n'));

add('yggdrasil', 'Yggdrasil', ['world tree', 'norse', 'nidhogg', 'roots'], [
  // Canopy
  arc(CX, 108, 86, Math.PI, TAU),
  // Trunk
  poly([
    [110, 108],
    [104, 214],
    [152, 214],
    [146, 108],
  ]),
  // Roots
  smoothPath([
    [104, 200],
    [74, 216],
    [58, 236],
  ]),
  smoothPath([
    [152, 200],
    [182, 216],
    [198, 236],
  ]),
  // Branch pair
  smoothPath([
    [118, 132],
    [90, 118],
    [64, 122],
  ]),
  smoothPath([
    [138, 132],
    [166, 118],
    [192, 122],
  ]),
  // Runestone ring at the canopy apex
  circle(CX, 74, 22),
  star(5, 2, 20, CX, 74),
].join('\n'));

add('triquetra', 'Triquetra', ['celtic', 'trinity knot', 'three'], [
  ...[0, 1, 2].map((i) => knotArc(70, 46, 300, -90 * DEG + (i * TAU) / 3)),
].join('\n'));

add('triquetra-circled', 'Triquetra Bound', ['celtic', 'trinity knot', 'circle'], [
  circle(CX, CY, 108),
  ...[0, 1, 2].map((i) => knotArc(60, 40, 300, -90 * DEG + (i * TAU) / 3)),
].join('\n'));

add('triskele', 'Triskele', ['celtic', 'threefold', 'spiral', 'sea'], [
  ...[0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * TAU) / 3;
    const [cx, cy] = P(CX, CY, 40, a);
    return goldenSpiral(9, 54, 1.05, cx, cy, a);
  }),
  circle(CX, CY, 108),
].join('\n'));

add('spiral-goddess', 'Spiral Goddess', ['goddess', 'womb', 'spiral', 'feminine'], [
  circle(CX, 58, 24),
  smoothPath([
    [128, 82],
    [147, 114],
    [142, 158],
    [128, 186],
    [114, 158],
    [109, 114],
    [128, 82],
  ]),
  goldenSpiral(6, 28, 1.25, 128, 136, -Math.PI / 2, 200),
  smoothPath([
    [111, 98],
    [84, 86],
    [68, 58],
  ]),
  smoothPath([
    [145, 98],
    [172, 86],
    [188, 58],
  ]),
  smoothPath([
    [119, 184],
    [106, 218],
    [98, 236],
  ]),
  smoothPath([
    [137, 184],
    [150, 218],
    [158, 236],
  ]),
].join('\n'));

add('horned-god', 'Horned God', ['cernunnos', 'pan', 'masculine', 'wild'], [
  smoothPath([
    [118, 108],
    [96, 96],
    [84, 74],
    [88, 48],
    [80, 20],
  ]),
  smoothPath([
    [138, 108],
    [160, 96],
    [172, 74],
    [168, 48],
    [176, 20],
  ]),
  smoothPath([
    [92, 74],
    [72, 64],
    [56, 40],
  ]),
  smoothPath([
    [164, 74],
    [184, 64],
    [200, 40],
  ]),
  `M128 96C146 96 155 112 155 130C155 150 142 162 128 162C114 162 101 150 101 130C101 112 110 96 128 96Z`,
  circle(117, 128, 3.2),
  circle(139, 128, 3.2),
  smoothPath([
    [96, 200],
    [110, 174],
    [146, 174],
    [160, 200],
  ]),
].join('\n'));

add('valknut', 'Valknut', ['odin', 'norse', 'knot', 'warrior'], [
  // Three interlocking triangles rotated around a common centre.
  ...[0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * TAU) / 3;
    const [cx, cy] = P(CX, CY, 22, a);
    return poly(ngon(3, 66, cx, cy, a), true);
  }),
].join('\n'));

add('vegvisir', 'Vegvisir', ['norse', 'wayfinder', 'compass', 'protection'], [
  circle(CX, CY, 104),
  circle(CX, CY, 44),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i * TAU) / 8 - Math.PI / 2;
    const s = P(CX, CY, 52, a);
    const e = P(CX, CY, 96, a);
    const c1 = P(CX, CY, 68, a - 22 * DEG);
    const c2 = P(CX, CY, 68, a + 22 * DEG);
    return `M${n(s[0])} ${n(s[1])}L${n(c1[0])} ${n(c1[1])}M${n(s[0])} ${n(s[1])}L${n(
      c2[0],
    )} ${n(c2[1])}M${n(s[0])} ${n(s[1])}L${n(e[0])} ${n(e[1])}`;
  }),
  ...[0, 1, 2, 3].map((i) => {
    const a = (i * TAU) / 4 + Math.PI / 4;
    const p = P(CX, CY, 60, a);
    return poly(ngon(4, 6, p[0], p[1], a));
  }),
].join('\n'));

add('mjolnir', "Mjölnir", ['thor', 'hammer', 'norse'], [
  // Head
  poly([
    [62, 70],
    [194, 70],
    [206, 122],
    [50, 122],
  ], true),
  poly([
    [50, 122],
    [206, 122],
  ]),
  // Grip
  poly([
    [116, 122],
    [140, 122],
    [142, 200],
    [114, 200],
  ]),
  // Wrapping
  ...Array.from({ length: 5 }, (_, i) => {
    const y = 132 + i * 14;
    return poly([
      [116 + i * 0.4, y],
      [140 - i * 0.4, y + 7],
    ]);
  }),
  // Pommel
  `M112 200C112 214 118 222 128 222C138 222 144 214 144 200Z`,
  // Knotwork on the head
  circle(128, 98, 15),
  star(5, 2, 13, 128, 98),
].join('\n'));

add('sunwheel', 'Sunwheel', ['sun cross', 'solstice', 'wheel of the year'], [
  circle(CX, CY, 96),
  circle(CX, CY, 34),
  ...[0, 1, 2, 3].map((i) => {
    const a = (i * TAU) / 4;
    const p0 = P(CX, CY, 34, a);
    const p1 = P(CX, CY, 96, a);
    return poly([p0, p1]);
  }),
].join('\n'));

add('wheel-of-year', 'Wheel of the Year', ['sabbat', 'eightfold', 'calendar'], [
  circle(CX, CY, 104),
  circle(CX, CY, 88),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i * TAU) / 8 - Math.PI / 2;
    const p0 = P(CX, CY, 88, a);
    const p1 = P(CX, CY, 104, a);
    return poly([p0, p1]);
  }),
  star(8, 3, 60),
].join('\n'));

add('moon-phases', 'Moon Phases', ['lunar', 'cycle', 'esbat'], [
  [0, 0.25, 0.5, 1, -0.5, -0.25, 0]
    .flatMap((k, i) => {
      const x = 34 + i * 31;
      const rim = circle(x, CY, 14);
      const lit = moonPhase(x, CY, 14, k);
      return lit ? [rim, fillPath(lit)] : [rim];
    })
    .join('\n'),
].join('\n'));

add('ankh', 'Ankh', ['life', 'kemet', 'egypt'], [
  `M${128} ${96}C${94} ${96} ${94} ${32} ${128} ${32}C${162} ${32} ${162} ${96} ${128} ${96}Z`,
  poly([
    [128, 96],
    [128, 232],
  ]),
  poly([
    [64, 128],
    [192, 128],
  ]),
].join('\n'));

add('eye-of-horus', 'Eye of Horus', ['wedjat', 'protection', 'kemet'], [
  smoothPath([
    [40, 118],
    [86, 92],
    [150, 96],
    [196, 124],
    [150, 150],
    [86, 146],
    [40, 118],
  ]),
  circle(126, 120, 24),
  poly([
    [126, 144],
    [140, 196],
    [104, 200],
  ]),
  smoothPath([
    [150, 100],
    [186, 66],
    [214, 62],
  ]),
].join('\n'));

add('athame', 'Athame', ['ritual knife', 'tool', 'air'], [
  poly([
    [128, 16],
    [146, 120],
    [128, 148],
    [110, 120],
  ], true),
  poly([
    [92, 148],
    [164, 148],
  ]),
  poly([
    [116, 148],
    [116, 232],
  ]),
  poly([
    [140, 148],
    [140, 232],
  ]),
  circle(128, 240, 10),
].join('\n'));

add('chalice', 'Chalice', ['water', 'grail', 'coven'], [
  smoothPath([
    [72, 44],
    [128, 128],
    [184, 44],
  ]),
  arc(128, 44, 56, 0, Math.PI),
  poly([
    [128, 128],
    [128, 196],
  ]),
  smoothPath([
    [80, 220],
    [104, 198],
    [152, 198],
    [176, 220],
  ]),
  star(5, 2, 18, 128, 74),
].join('\n'));

add('cauldron', 'Cauldron', ['rebirth', 'cerridwen', 'tool'], [
  // Rim
  poly([
    [54, 108],
    [202, 108],
  ]),
  // Bowl
  arc(CX, 108, 74, 6 * DEG, 174 * DEG),
  // Legs
  poly([
    [98, 176],
    [82, 204],
  ]),
  poly([
    [158, 176],
    [174, 204],
  ]),
  // Flame wisps
  smoothPath([
    [104, 88],
    [112, 68],
    [100, 50],
    [110, 30],
  ]),
  smoothPath([
    [128, 90],
    [128, 62],
    [128, 34],
  ]),
  smoothPath([
    [152, 88],
    [144, 68],
    [156, 50],
    [146, 30],
  ]),
].join('\n'));

add('besom', 'Besom', ['broom', 'cleansing', 'tool'], [
  poly([
    [190, 24],
    [126, 132],
  ]),
  poly([
    [104, 126],
    [146, 152],
  ]),
  poly([
    [96, 144],
    [138, 170],
  ]),
  ...Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    const x0 = 100 + t * 36;
    const y0 = 140 + t * 24;
    const x1 = 40 + t * 152;
    const y1 = 238 - Math.abs(t - 0.5) * 6;
    return smoothPath([
      [x0, y0],
      [x0 + (x1 - x0) * 0.5 + 8, y0 + (y1 - y0) * 0.55],
      [x1, y1],
    ]);
  }),
].join('\n'));

add('wand', 'Wand', ['ritual', 'fire', 'tool'], [
  poly([
    [44, 216],
    [168, 92],
  ]),
  star(5, 2, 34, 186, 74),
  smoothPath([
    [160, 84],
    [150, 62],
    [158, 40],
  ]),
].join('\n'));

add('crescent-and-star', 'Crescent & Star', ['moon', 'night', 'lunar'], [
  circle(CX, CY, 96),
  `M${128} ${52}A${76} ${76} 0 1 1 ${128} ${204}A${58} ${58} 0 1 0 ${128} ${52}Z`,
  star(5, 2, 26, 168, 96),
].join('\n'));

add('black-sun', 'Black Sun', ['sonnenrad', 'norse', 'esoteric'], [
  circle(CX, CY, 40),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
    const a = (i * TAU) / 12;
    const p0 = P(CX, CY, 40, a);
    const p1 = P(CX, CY, 100, a + 6 * DEG);
    const p2 = P(CX, CY, 100, a + 24 * DEG);
    return poly([p0, p1]) + poly([p1, P(CX, CY, 74, a + 14 * DEG), p2]);
  }),
].join('\n'));

add('ouroboros', 'Ouroboros', ['serpent', 'cycle', 'infinity'], [
  // Coil: open ring with a gap at the top for the head.
  arc(CX, CY, 96, -38 * DEG, 258 * DEG),
  // Head, biting the tail tip
  smoothPath([
    [110, 20],
    [140, 26],
    [160, 48],
    [146, 68],
    [120, 60],
    [106, 38],
    [110, 20],
  ]),
  circle(140, 46, 4.5),
  // Tail crossing into the mouth
  poly([
    [108, 24],
    [86, 16],
  ]),
].join('\n'));

add('solar-cross', 'Solar Cross', ['sun', 'equinox', 'quadrant'], [
  circle(CX, CY, 96),
  poly([
    [40, 128],
    [216, 128],
  ]),
  poly([
    [128, 40],
    [128, 216],
  ]),
  ...[0, 1, 2, 3].map((i) => {
    const a = (i * TAU) / 4 + Math.PI / 4;
    return poly([P(CX, CY, 62, a - 12 * DEG), P(CX, CY, 62, a + 12 * DEG)]);
  }),
].join('\n'));

add('elemental-pentagram', 'Elemental Pentagram', ['five elements', 'invocation'], [
  circle(CX, CY, 100),
  star(5, 2, 96),
  ...[0, 1, 2, 3, 4].map((i) => circle(...P(CX, CY, 118, -Math.PI / 2 + (i * TAU) / 5), 9)),
].join('\n'));

/* ───────────────────── alchemical glyphs ───────────────────── */

add('alch-fire', 'Alchemical Fire', ['element', 'salamander', 'triangle'], triangle(88));

add('alch-water', 'Alchemical Water', ['element', 'undine'], poly(ngon(3, 88, CX, CY, Math.PI / 2), true));

add('alch-air', 'Alchemical Air', ['element', 'sylph'], [
  poly(ngon(3, 88, CX, CY, -Math.PI / 2), true),
  poly([
    [74, 168],
    [182, 168],
  ]),
].join('\n'));

add('alch-earth', 'Alchemical Earth', ['element', 'gnome'], [
  poly(ngon(3, 88, CX, CY, Math.PI / 2), true),
  poly([
    [74, 90],
    [182, 90],
  ]),
].join('\n'));

add('alch-sulfur', 'Alchemical Sulfur', ['soul', 'brimstone', 'solve'], [
  poly(ngon(3, 52, CX, 186, -Math.PI / 2), true),
  poly([
    [128, 134],
    [128, 58],
  ]),
  poly([
    [100, 84],
    [156, 84],
  ]),
].join('\n'));

add('alch-mercury', 'Alchemical Mercury', ['spirit', 'quicksilver', 'hermes'], [
  circle(CX, 60, 24),
  poly([
    [128, 84],
    [128, 138],
  ]),
  arc(CX, 138, 32, 0, Math.PI),
  poly([
    [96, 138],
    [160, 138],
  ]),
  poly([
    [128, 170],
    [128, 216],
  ]),
  poly([
    [104, 216],
    [152, 216],
  ]),
].join('\n'));

add('alch-salt', 'Alchemical Salt', ['body', 'crystallisation'], [
  circle(CX, 84, 60),
  poly([
    [68, 84],
    [188, 84],
  ]),
].join('\n'));

add('alch-gold', 'Alchemical Gold', ['sol', 'sun metal', 'perfection'], [
  circle(CX, CY, 88),
  circle(CX, CY - 30, 6),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => poly([P(CX, CY, 100, (i * TAU) / 8), P(CX, CY, 116, (i * TAU) / 8)])),
].join('\n'));

add('alch-silver', 'Alchemical Silver', ['luna', 'moon metal'], [
  crescent(CX, CY, 84, 96, false),
  circle(158, 96, 10),
].join('\n'));

add('philosophers-stone', 'Philosopher’s Stone', ['magnum opus', 'rubedo'], [
  circle(CX, CY, 100),
  poly(ngon(3, 76, CX, CY, -Math.PI / 2), true),
  poly(ngon(3, 76, CX, CY, Math.PI / 2), true),
  circle(CX, CY, 26),
].join('\n'));

add('squared-circle', 'Squaring the Circle', ['talisman', 'alchemy'], [
  circle(CX, CY, 100),
  'M28 28L228 28L228 228L28 228Z',
].join('\n'));

add('planetary-seal', 'Planetary Seal', ['orrery', 'astrology', 'spheres'], [
  circle(CX, CY, 100),
  circle(CX, CY, 76),
  circle(CX, CY, 40),
  star(7, 3, 76),
  ...[0, 1, 2, 3, 4, 5].map((i) => circle(...P(CX, CY, 88, (i * TAU) / 6), 8)),
].join('\n'));

add('sigil-star', 'Sigil Star', ['chaos magic', 'intention', 'will'], [
  circle(CX, CY, 104),
  star(11, 5, 96),
].join('\n'));

add('crescent-moon', 'Crescent Moon', ['lunar', 'moon'], [
  crescent(CX, CY, 104, 118, false),
].join('\n'));

add('moon-tree', 'Moon Tree', ['lunar', 'nature', 'world tree'], [
  crescent(CX, CY, 106, 120, false),
  poly([
    [152, 196],
    [152, 116],
  ]),
  smoothPath([
    [152, 196],
    [132, 214],
    [118, 234],
  ]),
  smoothPath([
    [152, 196],
    [172, 214],
    [186, 234],
  ]),
  smoothPath([
    [152, 138],
    [128, 116],
    [104, 118],
  ]),
  smoothPath([
    [152, 162],
    [174, 142],
    [196, 144],
  ]),
  circle(150, 92, 20),
].join('\n'));

add('crescent-stars', 'Crescent & Stars', ['lunar', 'night', 'sky'], [
  crescent(CX, CY, 104, 118, false),
  ...[
    [70, 70, 13],
    [92, 138, 9],
    [186, 62, 10],
    [196, 152, 14],
    [128, 200, 8],
  ].map(([x, y, r]) => {
    const d = [0, 1, 2, 3]
      .map((i) => {
        const a = (i * Math.PI) / 2;
        return `M${n(x + r * Math.cos(a))} ${n(y + r * Math.sin(a))}L${n(x)} ${n(y)}`;
      })
      .join('');
    return d;
  }),
].join('\n'));

add('eightfold-star', 'Eightfold Star', ['chaos star', 'eight'], [
  star(8, 3, 100),
  circle(CX, CY, 104),
].join('\n'));

add('compass-rose', 'Compass Rose', ['wayfinding', 'navigation'], [
  circle(CX, CY, 100),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i * TAU) / 8 - Math.PI / 2;
    const tip = P(CX, CY, 96, a);
    const l = P(CX, CY, 26, a - Math.PI / 8);
    const r = P(CX, CY, 26, a + Math.PI / 8);
    return poly([tip, l, r], true);
  }),
].join('\n'));

/* ══════════════════════════ FRAMES & SHIELDS ═══════════════════════════ */

const frames = [];

const addFrame = (id, name, tags, markup) => frames.push({ id, name, tags, markup });

addFrame('frame-circle-thin', 'Circle Border', ['round', 'minimal', 'ring'], circle(CX, CY, 116));

addFrame('frame-circle-double', 'Double Ring', ['round', 'ring', 'classic'], [
  circle(CX, CY, 116),
  circle(CX, CY, 104),
].join('\n'));

addFrame('frame-circle-rope', 'Rope Ring', ['round', 'braid', 'textured'], [
  circle(CX, CY, 112),
  circle(CX, CY, 100),
  ...Array.from({ length: 44 }, (_, i) => {
    const a = (i * TAU) / 44;
    const b = a + TAU / 88;
    return poly([P(CX, CY, 100, a), P(CX, CY, 112, b)]);
  }),
].join('\n'));

addFrame('frame-circle-ornate', 'Ornate Circle', ['round', 'filigree', 'elegant'], [
  circle(CX, CY, 116),
  circle(CX, CY, 96),
  arc(CX, CY, 106, 0, TAU),
  ...Array.from({ length: 24 }, (_, i) => {
    const a = (i * TAU) / 24;
    return circle(...P(CX, CY, 106, a), 2.6);
  }),
  ...[0, 1, 2, 3].map((i) => {
    const a = (i * TAU) / 4 - Math.PI / 2;
    const p0 = P(CX, CY, 116, a - 8 * DEG);
    const p1 = P(CX, CY, 130, a);
    const p2 = P(CX, CY, 116, a + 8 * DEG);
    return smoothPath([p0, [p1[0], p1[1]], p2]);
  }),
].join('\n'));

addFrame('frame-shield-crest', 'Crest Shield', ['heraldic', 'shield', 'badge'], [
  smoothPath([
    [64, 34],
    [192, 34],
    [196, 122],
    [128, 224],
    [60, 122],
    [64, 34],
  ], true),
  smoothPath([
    [80, 50],
    [176, 50],
    [180, 120],
    [128, 202],
    [76, 120],
    [80, 50],
  ], true),
].join('\n'));

addFrame('frame-shield-pointed', 'Pointed Shield', ['heraldic', 'shield'], [
  smoothPath([
    [58, 28],
    [198, 28],
    [192, 150],
    [128, 232],
    [64, 150],
    [58, 28],
  ], true),
  poly([
    [58, 72],
    [198, 72],
  ]),
  poly([
    [128, 28],
    [128, 232],
  ]),
].join('\n'));

addFrame('frame-heater-shield', 'Heater Shield', ['heraldic', 'shield', 'knight'], [
  smoothPath([
    [44, 32],
    [212, 32],
    [204, 140],
    [128, 226],
    [52, 140],
    [44, 32],
  ], true),
].join('\n'));

addFrame('frame-banner', 'Ornate Banner', ['ribbon', 'scroll', 'label'], [
  poly([
    [36, 96],
    [220, 96],
    [220, 176],
    [186, 160],
    [128, 184],
    [70, 160],
    [36, 176],
  ], true),
  poly([
    [36, 96],
    [60, 76],
    [196, 76],
    [220, 96],
  ]),
  poly([
    [52, 120],
    [204, 120],
  ]),
].join('\n'));

addFrame('frame-scroll', 'Scroll Cartouche', ['ribbon', 'parchment', 'title'], [
  poly([
    [58, 92],
    [198, 92],
    [198, 164],
    [58, 164],
  ], true),
  poly([
    [70, 106],
    [186, 106],
    [186, 150],
    [70, 150],
  ], true),
  `M58 92C36 92 26 108 34 124C40 136 34 152 58 164`,
  circle(40, 128, 13),
  `M198 92C220 92 230 108 222 124C216 136 222 152 198 164`,
  circle(216, 128, 13),
].join('\n'));

addFrame('frame-laurel', 'Laurel Wreath', ['wreath', 'botanical', 'victory'], [
  ...[-1, 1].flatMap((sgn) =>
    Array.from({ length: 10 }, (_, i) => {
      const t = i / 9;
      const a = (90 + sgn * (4 + t * 156)) * DEG;
      const [cx, cy] = P(CX, CY, 96, a);
      const tilt = a + (Math.PI / 2) * sgn + 0.35;
      const len = 27 - t * 5;
      const tip = P(cx, cy, len, tilt);
      const q = P(cx, cy, len * 0.45, tilt + Math.PI / 2.4);
      const r = P(cx, cy, len * 0.45, tilt - Math.PI / 2.4);
      return `M${n(cx)} ${n(cy)}Q${n(q[0])} ${n(q[1])} ${n(tip[0])} ${n(tip[1])}Q${n(r[0])} ${n(
        r[1],
      )} ${n(cx)} ${n(cy)}Z`;
    }),
  ),
  // Binding stem joining both branches
  `M128 32A96 96 0 0 1 128 224`,
  `M128 32A96 96 0 0 0 128 224`,
].join('\n'));

addFrame('frame-arch', 'Arch Frame', ['gothic', 'cathedral', 'portal'], [
  arc(CX, 128, 84, Math.PI, TAU),
  arc(CX, 128, 68, Math.PI, TAU),
  poly([
    [44, 128],
    [44, 232],
  ]),
  poly([
    [212, 128],
    [212, 232],
  ]),
  poly([
    [60, 128],
    [60, 216],
  ]),
  poly([
    [196, 128],
    [196, 216],
  ]),
  poly([
    [60, 216],
    [196, 216],
  ]),
  poly([
    [44, 232],
    [212, 232],
  ]),
].join('\n'));

addFrame('frame-hexagon', 'Hexagon Plate', ['hex', 'geometric', 'badge'], [
  poly(ngon(6, 112, CX, CY, 0), true),
  poly(ngon(6, 96, CX, CY, 0), true),
].join('\n'));

addFrame('frame-octagon', 'Octagon Plate', ['geometric', 'badge'], [
  poly(ngon(8, 112, CX, CY, -Math.PI / 8), true),
  poly(ngon(8, 96, CX, CY, -Math.PI / 8), true),
].join('\n'));

addFrame('frame-shield-runes', 'Rune Shield', ['heraldic', 'runic', 'norse'], [
  smoothPath([
    [56, 30],
    [200, 30],
    [194, 144],
    [128, 230],
    [62, 144],
    [56, 30],
  ], true),
  poly([
    [128, 44],
    [128, 206],
  ]),
  poly([
    [76, 62],
    [76, 170],
  ]),
  poly([
    [180, 62],
    [180, 170],
  ]),
  poly([
    [76, 92],
    [104, 76],
  ]),
  poly([
    [76, 124],
    [104, 108],
  ]),
  poly([
    [180, 92],
    [152, 76],
  ]),
  poly([
    [180, 124],
    [152, 108],
  ]),
].join('\n'));

addFrame('frame-mandorla', 'Mandorla', ['almond', 'aureole', 'sacred'], [
  `M${128} ${16}C${224} ${80} ${224} ${176} ${128} ${240}C${32} ${176} ${32} ${80} ${128} ${16}Z`,
  `M${128} ${38}C${204} ${92} ${204} ${164} ${128} ${218}C${52} ${164} ${52} ${92} ${128} ${38}Z`,
].join('\n'));

addFrame('frame-sunwheel-plate', 'Sunwheel Plate', ['sun', 'plate', 'round'], [
  circle(CX, CY, 116),
  circle(CX, CY, 100),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
    const a = (i * TAU) / 12;
    return poly([P(CX, CY, 100, a), P(CX, CY, 116, a)]);
  }),
].join('\n'));

addFrame('frame-rune-ring', 'Rune Ring', ['ring', 'runes', 'esoteric'], [
  circle(CX, CY, 116),
  circle(CX, CY, 88),
  ...RUNES.slice(0, 16).map(([, , segs], i) => {
    const a = (i * TAU) / 16 - Math.PI / 2;
    const c = P(CX, CY, 102, a);
    const segsScaled = segs.map((s) =>
      s.map(([x, y]) => {
        const lx = (x - 50) * 0.34;
        const ly = (y - 50) * 0.34;
        // Rotate the stave so it reads around the ring.
        const rot = a + Math.PI / 2;
        return [
          c[0] + lx * Math.cos(rot) - ly * Math.sin(rot),
          c[1] + lx * Math.sin(rot) + ly * Math.cos(rot),
        ];
      }),
    );
    return strokes(segsScaled);
  }),
].join('\n'));

addFrame('frame-corner-ornaments', 'Corner Ornaments', ['flourish', 'decorative'], [
  smoothPath([
    [20, 56],
    [56, 56],
    [56, 20],
  ]),
  smoothPath([
    [236, 56],
    [200, 56],
    [200, 20],
  ]),
  smoothPath([
    [20, 200],
    [56, 200],
    [56, 236],
  ]),
  smoothPath([
    [236, 200],
    [200, 200],
    [200, 236],
  ]),
  circle(68, 68, 8),
  circle(188, 68, 8),
  circle(68, 188, 8),
  circle(188, 188, 8),
].join('\n'));

/* ═══════════════════════════ TEXTURE / GRADIENT ════════════════════════ */
/* Vector wash backgrounds (raster textures are produced by
   scripts/generate-textures.js and live alongside these). */

const textures = [];

const addTex = (id, name, tags, markup, background) =>
  textures.push({ id, name, tags, markup, background });

/**
 * Vector gradient washes. Each is emitted as its own `<svg>` because a flat
 * `background` cannot express a gradient — `rawSvg` short-circuits {@link doc}.
 * @param {string} id @param {string} name @param {string[]} tags
 * @param {Array<[number,string]>} stops @param {number} angle degrees
 */
const wash = (id, name, tags, stops, angle = 135) => {
  const rad = (angle * Math.PI) / 180;
  const x1 = Math.round(50 - Math.cos(rad) * 50);
  const y1 = Math.round(50 - Math.sin(rad) * 50);
  const x2 = Math.round(50 + Math.cos(rad) * 50);
  const y2 = Math.round(50 + Math.sin(rad) * 50);
  textures.push({
    id,
    name,
    tags: [...tags, 'gradient', 'background'],
    markup: '',
    rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
<title>${name}</title>
<defs>
  <linearGradient id="wash" gradientUnits="userSpaceOnUse" x1="${x1 * 2.56}" y1="${y1 * 2.56}" x2="${
    x2 * 2.56
  }" y2="${y2 * 2.56}">
    ${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.28" r="0.72">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.1"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.34"/>
  </radialGradient>
</defs>
<rect width="256" height="256" fill="url(#wash)"/>
<rect width="256" height="256" fill="url(#glow)"/>
</svg>
`,
  });
};

/**
 * Procedural ground textures built from SVG filters — no bitmaps, so they stay
 * sharp at 4K and weigh a few hundred bytes each.
 *
 * @param {string} id @param {string} name @param {string[]} tags
 * @param {Object} o
 * @param {string} o.base    base fill colour
 * @param {string} o.veil    gradient/overlay stops
 * @param {number} [o.grain] fractal noise base frequency (higher = finer)
 * @param {number} [o.grainOpacity]
 * @param {number} [o.scale] turbulence scale for coarse patterns
 * @param {string} [o.blend] feBlend mode for the noise layer
 */
const groundTexture = (id, name, tags, o) => {
  const {
    base,
    veil = [],
    grain = 0.8,
    grainOpacity = 0.32,
    scale = 1,
    blend = 'overlay',
    extra = '',
  } = o;
  textures.push({
    id,
    name,
    tags: [...tags, 'texture', 'background'],
    markup: '',
    rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
<title>${name}</title>
<defs>
  <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="${grain * scale}" numOctaves="4" seed="7" result="n"/>
    <feColorMatrix in="n" type="saturate" values="0" result="mono"/>
    <feComponentTransfer in="mono">
      <feFuncA type="linear" slope="${grainOpacity}"/>
    </feComponentTransfer>
  </filter>
  <linearGradient id="veil" x1="0" y1="0" x2="1" y2="1">
    ${veil.map(([o2, c]) => `<stop offset="${o2}" stop-color="${c}"/>`).join('')}
  </linearGradient>
  <radialGradient id="vig" cx="0.5" cy="0.42" r="0.75">
    <stop offset="0.35" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.42"/>
  </radialGradient>
  ${extra}
</defs>
<rect width="256" height="256" fill="${base}"/>
<rect width="256" height="256" fill="url(#veil)" style="mix-blend-mode:${blend}"/>
<rect width="256" height="256" filter="url(#grain)"/>
<rect width="256" height="256" fill="url(#vig)"/>
</svg>
`,
  });
};

groundTexture('tex-parchment-aged', 'Aged Parchment', ['paper', 'vellum', 'scroll'], {
  base: '#d8c49a',
  veil: [
    [0, '#f6ecd2'],
    [0.45, '#e2ceA4'],
    [1, '#b99e6f'],
  ],
  grain: 0.75,
  grainOpacity: 0.26,
});

groundTexture('tex-parchment-stained', 'Stained Parchment', ['paper', 'burnt', 'ritual'], {
  base: '#c8ae7e',
  veil: [
    [0, '#e8d6ac'],
    [0.5, '#a8885a'],
    [1, '#6b512f'],
  ],
  grain: 1.1,
  grainOpacity: 0.36,
});

groundTexture('tex-stone-cracked', 'Cracked Stone', ['rock', 'granite', 'ancient'], {
  base: '#4e5157',
  veil: [
    [0, '#767b83'],
    [0.55, '#44474d'],
    [1, '#23252a'],
  ],
  grain: 0.32,
  grainOpacity: 0.5,
  blend: 'overlay',
  extra: `
  <filter id="cracks" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="turbulence" baseFrequency="0.02 0.05" numOctaves="3" seed="19" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  40 0 0 0 -18"/>
  </filter>`,
});

groundTexture('tex-wood-weathered', 'Weathered Wood', ['plank', 'timber', 'grain'], {
  base: '#4a3524',
  veil: [
    [0, '#6b4c33'],
    [0.5, '#402c1c'],
    [1, '#241708'],
  ],
  grain: 0.06,
  grainOpacity: 0.55,
  blend: 'multiply',
  extra: `
  <filter id="rings" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.42" numOctaves="5" seed="3" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="9" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`,
});

groundTexture('tex-slate-dark', 'Dark Slate', ['minimal', 'dark', 'backdrop'], {
  base: '#15161b',
  veil: [
    [0, '#23252c'],
    [1, '#0b0c10'],
  ],
  grain: 0.65,
  grainOpacity: 0.22,
});

wash('bg-gradient-ember', 'Ember Wash', ['warm', 'fire', 'forge'], [[0, '#3a1206'], [0.5, '#1c0a06'], [1, '#0a0505']]);
wash('bg-gradient-night', 'Night Wash', ['dark', 'void', 'midnight'], [[0, '#181428'], [0.55, '#0b0912'], [1, '#050409']], 160);
wash('bg-gradient-moss', 'Moss Wash', ['green', 'nature', 'forest'], [[0, '#1b2a18'], [0.5, '#0d150c'], [1, '#050805']]);
wash('bg-gradient-gold', 'Gold Leaf', ['metal', 'luxe', 'gilding'], [[0, '#4a3617'], [0.42, '#8f6d20'], [0.62, '#b8912f'], [1, '#241a0a']], 120);
wash('bg-gradient-parchment', 'Parchment', ['paper', 'aged', 'light'], [[0, '#f4e9cd'], [0.55, '#e6d5ae'], [1, '#c9b286']], 120);
wash('bg-gradient-blood', 'Dried Blood', ['red', 'dark', 'ritual'], [[0, '#40131a'], [0.6, '#1e090d'], [1, '#0a0405']]);
wash('bg-gradient-twilight', 'Twilight', ['purple', 'dusk', 'sky'], [[0, '#2b1d3c'], [0.45, '#161022'], [1, '#080611']], 170);

/* Decorative rule lines / dividers — useful for lockup subtitles. */
addTex('rule-divider', 'Divider Rule', ['line', 'rule', 'divider'], [
  poly([
    [24, 128],
    [104, 128],
  ]),
  poly([
    [152, 128],
    [232, 128],
  ]),
  poly(ngon(4, 12, 128, 128, 0), true),
].join('\n'));

addTex('rule-diamond', 'Diamond Rule', ['line', 'rule', 'divider'], [
  poly([
    [20, 128],
    [112, 128],
  ]),
  poly([
    [144, 128],
    [236, 128],
  ]),
  poly(ngon(4, 16, 128, 128, 0), true),
  circle(128, 128, 4),
].join('\n'));

/* ══════════════════════════════ EMITTERS ═══════════════════════════════ */

/** Ensure directory exists. */
const ensure = (dir) => fs.mkdirSync(dir, { recursive: true });

/** Write library.json + all SVGs. */
function writeLibrary() {
  const groups = [
    {
      id: 'symbols',
      label: 'Pagan & Esoteric Symbols',
      blurb: 'Runes, lunar marks, sacred geometry and alchemical glyphs.',
      items: symbols,
    },
    {
      id: 'frames',
      label: 'Frames & Shields',
      blurb: 'Borders, crests, banners and sunwheel plates.',
      items: frames,
    },
    {
      id: 'textures',
      label: 'Textures & Backgrounds',
      blurb: 'Vector washes, rules and procedurally generated ground textures.',
      items: textures,
    },
  ];

  const manifest = {
    generatedAt: new Date().toISOString(),
    license: 'CC0-1.0 — generated in-house for Pagan Logo Maker, free for commercial use.',
    viewBox: [256, 256],
    groups: groups.map((g) => ({
      id: g.id,
      label: g.label,
      blurb: g.blurb,
      items: g.items.map((item) => ({
        id: item.id,
        name: item.name,
        tags: item.tags,
        category: g.id,
        path: `assets/svgs/${g.id}/${item.id}.svg`,
      })),
    })),
  };

  ensure(path.dirname(MANIFEST_OUT));
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2));

  let count = 0;
  for (const g of groups) {
    const dir = path.join(SVG_OUT, g.id);
    ensure(dir);
    for (const item of g.items) {
      fs.writeFileSync(
        path.join(dir, `${item.id}.svg`),
        doc(item.markup, { background: item.background, rawSvg: item.rawSvg }),
      );
      count++;
    }
  }
  return count;
}

const total = writeLibrary();
console.log(`✔ ${total} vector assets written to assets/svgs/`);
console.log(`✔ manifest → ${path.relative(ROOT, MANIFEST_OUT)}`);
