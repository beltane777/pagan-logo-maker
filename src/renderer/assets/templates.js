/**
 * @file src/renderer/assets/templates.js
 * @description Curated starter layouts. Each template is a plain recipe that is
 * replayed through the canvas engine, so templates survive library changes and
 * never carry stale bitmap state.
 *
 * Schema
 * ──────
 * ```
 * {
 *   id, name, blurb, tags,
 *   artboard: { width, height, background },
 *   layers: [ RecipeLayer, ... ]   // bottom → top
 * }
 * ```
 * A `RecipeLayer` is one of:
 *   `{ type: 'symbol', assetId, finish, x, y, size }`  — `size` = fraction of artboard width
 *   `{ type: 'text', text, font, fontSize, fill, curve, letterSpacing, x, y, shadow }`
 *
 * All coordinates are fractions of the artboard (0–1), so a template looks right
 * at any canvas size.
 */

/** @typedef {Object} RecipeLayer */

export const TEMPLATES = [
  {
    id: 'coven-seal',
    name: 'Coven Seal',
    blurb: 'Triple moon, pentacle and a ringed inscription — the classic coven badge.',
    tags: ['badge', 'coven', 'lunar', 'pentacle'],
    artboard: { width: 1200, height: 1200, background: '#0d0c12' },
    layers: [
      { type: 'symbol', assetId: 'frame-circle-ornate', finish: 'gold', x: 0.5, y: 0.5, size: 0.92 },
      { type: 'symbol', assetId: 'triple-moon', finish: 'gold', x: 0.5, y: 0.5, size: 0.6 },
      {
        type: 'text',
        text: 'THE COVEN OF THE OLD ROAD',
        font: 'Cinzel Decorative',
        fontSize: 34,
        curve: 300,
        letterSpacing: 3,
        fill: '#e3c878',
        x: 0.5,
        y: 0.28,
      },
    ],
  },
  {
    id: 'rune-shield',
    name: 'Rune Shield',
    blurb: 'Norse shield-wall mark for a kindred or mead hall.',
    tags: ['norse', 'rune', 'shield', 'heraldic'],
    artboard: { width: 1200, height: 1400, background: '#0a0f0c' },
    layers: [
      { type: 'symbol', assetId: 'frame-shield-runes', finish: 'silver', x: 0.5, y: 0.46, size: 0.8 },
      { type: 'symbol', assetId: 'valknut', finish: 'silver', x: 0.5, y: 0.34, size: 0.3 },
      {
        type: 'text',
        text: 'ODINSSON',
        font: 'MedievalSharp',
        fontSize: 68,
        letterSpacing: 10,
        fill: '#cfd6dd',
        x: 0.5,
        y: 0.82,
      },
    ],
  },
  {
    id: 'alchemist-mark',
    name: 'Alchemist Mark',
    blurb: 'Squaring the circle with a sulfur glyph — a lab-grade sigil.',
    tags: ['alchemy', 'minimal', 'geometric'],
    artboard: { width: 1200, height: 1200, background: '#16110a' },
    layers: [
      { type: 'symbol', assetId: 'squared-circle', finish: 'copper', x: 0.5, y: 0.5, size: 0.86 },
      { type: 'symbol', assetId: 'alch-sulfur', finish: 'copper', x: 0.5, y: 0.5, size: 0.36 },
      {
        type: 'text',
        text: 'SOLVE ET COAGULA',
        font: 'Cormorant Garamond',
        fontSize: 38,
        letterSpacing: 9,
        fill: '#f0b789',
        x: 0.5,
        y: 0.86,
      },
    ],
  },
  {
    id: 'greenwitch',
    name: 'Greenwitch',
    blurb: 'Botanical wreath with a moon-tree at the heart.',
    tags: ['nature', 'herbal', 'wreath', 'moon'],
    artboard: { width: 1200, height: 1200, background: '#0b120c' },
    layers: [
      { type: 'symbol', assetId: 'frame-laurel', finish: 'moss', x: 0.5, y: 0.5, size: 0.92 },
      { type: 'symbol', assetId: 'moon-tree', finish: 'gold', x: 0.5, y: 0.48, size: 0.5 },
      {
        type: 'text',
        text: 'GREENWITCH',
        font: 'Uncial Antiqua',
        fontSize: 46,
        letterSpacing: 6,
        fill: '#a8c191',
        x: 0.5,
        y: 0.09,
      },
      {
        type: 'text',
        text: 'herbs · roots · remedy',
        font: 'Cormorant Garamond',
        fontSize: 24,
        letterSpacing: 7,
        fill: '#6f8f5f',
        x: 0.5,
        y: 0.93,
      },
    ],
  },
  {
    id: 'nightmarket',
    name: 'Night Market',
    blurb: 'Bold crescent-and-star lockup for a shopfront or market stall.',
    tags: ['crescent', 'modern', 'shop'],
    artboard: { width: 1600, height: 900, background: '#0d0c12' },
    layers: [
      { type: 'symbol', assetId: 'crescent-stars', finish: 'silver', x: 0.72, y: 0.5, size: 0.46 },
      {
        type: 'text',
        text: 'NIGHTMARKET',
        font: 'Cinzel Decorative',
        fontSize: 78,
        letterSpacing: 12,
        fill: '#efe3c6',
        x: 0.32,
        y: 0.44,
      },
      {
        type: 'text',
        text: 'CARDS · CANDLES · CHARM',
        font: 'Cormorant Garamond',
        fontSize: 30,
        letterSpacing: 10,
        fill: '#d4af4f',
        x: 0.32,
        y: 0.56,
      },
    ],
  },
  {
    id: 'tree-of-being',
    name: 'Tree of Being',
    blurb: 'Sephirothic diagram rendered as a clean tattoo-style emblem.',
    tags: ['kabbalah', 'tree', 'tattoo'],
    artboard: { width: 1200, height: 1600, background: '#08070a' },
    layers: [
      { type: 'symbol', assetId: 'tree-of-life', finish: 'gold', x: 0.5, y: 0.45, size: 0.85 },
      {
        type: 'text',
        text: 'AS ABOVE',
        font: 'IM Fell English',
        fontSize: 54,
        letterSpacing: 14,
        fill: '#f7e7a8',
        x: 0.5,
        y: 0.83,
      },
      {
        type: 'text',
        text: 'so below',
        font: 'IM Fell English',
        fontSize: 44,
        letterSpacing: 10,
        fill: '#b8912f',
        x: 0.5,
        y: 0.89,
      },
    ],
  },
];

/** Fast lookup. */
export const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.id, t]));
