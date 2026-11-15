/**
 * @file src/renderer/canvas/text.js
 * @description Typography builders. Curved text is composed from ordinary
 * Fabric `Text` objects arranged along an arc and wrapped in a `Group`, which
 * means:
 *
 *   • no custom Fabric subclass to register or keep in sync with upgrades,
 *   • native serialisation, hit-testing, grouping and SVG export,
 *   • a single "rebuild" path when any typographic property changes.
 *
 * A flat layer uses a `Textbox` so it re-flows on width changes; a curved layer
 * uses the group builder.
 *
 * @see ./engine.js — `updateTextStyle` swaps the object in place.
 */

import { Group, Textbox, FabricText, Shadow } from 'fabric';

/** @typedef {Object} TextConfig
 * @property {string} text
 * @property {string} fontFamily
 * @property {number} fontSize
 * @property {string} fontWeight
 * @property {boolean} italic
 * @property {string} fill
 * @property {number} letterSpacing   px, may be negative
 * @property {number} curve           degrees of arc, 0 = flat, max 360
 * @property {number} lineHeight
 * @property {boolean} uppercase
 * @property {number} shadowDepth     0 = off
 * @property {string} shadowColor
 * @property {string} align
 */

/** @type {TextConfig} */
export const DEFAULT_TEXT = {
  text: 'SIGIL',
  fontFamily: 'Cinzel Decorative',
  fontSize: 96,
  fontWeight: '400',
  italic: false,
  fill: '#d4af4f',
  letterSpacing: 4,
  curve: 0,
  lineHeight: 1.1,
  uppercase: true,
  shadowDepth: 0,
  shadowColor: 'rgba(0,0,0,0.65)',
  align: 'center',
};

/** Fonts bundled with the app — offered in the inspector. */
export const FONT_CHOICES = [
  { label: 'Cinzel Decorative', value: 'Cinzel Decorative', note: 'Roman capitals' },
  { label: 'Cormorant Garamond', value: 'Cormorant Garamond', note: 'Elegant serif' },
  { label: 'Uncial Antiqua', value: 'Uncial Antiqua', note: 'Medieval uncial' },
  { label: 'IM Fell English', value: 'IM Fell English', note: 'Antique press' },
  { label: 'Metamorphous', value: 'Metamorphous', note: 'Fantasy carved' },
  { label: 'Almendra SC', value: 'Almendra SC', note: 'Small caps' },
  { label: 'MedievalSharp', value: 'MedievalSharp', note: 'Hand-cut' },
  { label: 'Noto Sans Runic', value: 'Noto Sans Runic', note: 'Elder Futhark' },
];

/** Shared measuring context — created lazily, reused for all arc maths. */
let measureCtx = null;

/**
 * Measure a string in a given font at a given size.
 * @param {string} str
 * @param {string} font CSS font shorthand
 * @returns {number} width in px
 */
function measure(str, font) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = font;
  return measureCtx.measureText(str).width;
}

/**
 * Cache of loaded font readiness — curved text needs real metrics, so we make
 * sure the webfont is available before measuring.
 * @param {string} family
 */
export async function ensureFont(family) {
  try {
    if (document.fonts?.load) await document.fonts.load(`16px "${family}"`);
  } catch {
    /* Font loading failure is non-fatal — fall back to default metrics. */
  }
}

/**
 * Build a drop shadow from config.
 * @param {TextConfig} cfg
 * @returns {Shadow|null}
 */
function shadowFor(cfg) {
  if (!cfg.shadowDepth) return null;
  return new Shadow({
    color: cfg.shadowColor || 'rgba(0,0,0,0.65)',
    blur: cfg.shadowDepth * 1.6,
    offsetX: cfg.shadowDepth * 0.45,
    offsetY: cfg.shadowDepth * 0.6,
  });
}

/**
 * Create the Fabric object for a text layer.
 * @param {Partial<TextConfig>} config
 * @param {{left?: number, top?: number}} [placement]
 * @returns {Promise<import('fabric').FabricObject>}
 */
export async function buildTextObject(config, placement = {}) {
  const cfg = { ...DEFAULT_TEXT, ...config };
  await ensureFont(cfg.fontFamily);
  return cfg.curve > 0 ? buildArcText(cfg, placement) : buildFlatText(cfg, placement);
}

/**
 * Flat, re-flowable text block.
 * @param {TextConfig} cfg
 * @param {{left?: number, top?: number}} placement
 * @returns {Textbox}
 */
function buildFlatText(cfg, placement) {
  const content = cfg.uppercase ? cfg.text.toUpperCase() : cfg.text;
  const box = new Textbox(content, {
    fontFamily: cfg.fontFamily,
    fontSize: cfg.fontSize,
    fontWeight: cfg.fontWeight,
    fontStyle: cfg.italic ? 'italic' : 'normal',
    fill: cfg.fill,
    charSpacing: cfg.letterSpacing * 10, // Fabric uses 1/1000 em
    textAlign: cfg.align,
    lineHeight: cfg.lineHeight,
    width: Math.max(280, measure(content, `${cfg.fontSize}px "${cfg.fontFamily}"`) * 1.15),
    originX: 'center',
    originY: 'center',
    left: placement.left ?? 0,
    top: placement.top ?? 0,
    shadow: shadowFor(cfg),
    objectCaching: true,
  });
  box.set({ plmType: 'text' });
  return box;
}

/**
 * Text wrapped around an arc.
 *
 * The arc is parameterised by `curve` (total sweep in degrees). Characters are
 * laid out with their *advance widths* accumulated along the arc so the spacing
 * stays even regardless of glyph width; each glyph is rotated tangentially.
 *
 * @param {TextConfig} cfg
 * @param {{left?: number, top?: number}} placement
 * @returns {Group}
 */
function buildArcText(cfg, placement) {
  const content = cfg.uppercase ? cfg.text.toUpperCase() : cfg.text;
  const chars = [...content];
  const font = `${cfg.italic ? 'italic ' : ''}${cfg.fontWeight} ${cfg.fontSize}px "${cfg.fontFamily}"`;
  const sweep = Math.min(360, Math.max(1, cfg.curve)) * (Math.PI / 180);

  // Advance widths including the manual letter-spacing.
  const advances = chars.map((ch) => measure(ch, font) + cfg.letterSpacing);
  const totalAdvance = advances.reduce((a, b) => a + b, 0) || 1;

  // Radius chosen so the string occupies exactly `sweep` radians.
  const radius = totalAdvance / sweep;

  /** Objects positioned about the arc origin; the group is recentred after. */
  const parts = [];
  let travelled = 0;

  chars.forEach((ch, i) => {
    const advance = advances[i];
    const angle = -sweep / 2 + ((travelled + advance / 2) / totalAdvance) * sweep;
    if (ch.trim()) {
      const glyph = new FabricText(ch, {
        fontFamily: cfg.fontFamily,
        fontSize: cfg.fontSize,
        fontWeight: cfg.fontWeight,
        fontStyle: cfg.italic ? 'italic' : 'normal',
        fill: cfg.fill,
        originX: 'center',
        originY: 'bottom', // sit on the arc baseline
        left: Math.sin(angle) * radius,
        top: -Math.cos(angle) * radius,
        angle: (angle * 180) / Math.PI,
        shadow: shadowFor(cfg),
        objectCaching: true,
      });
      glyph.set({ plmType: 'glyph' });
      parts.push(glyph);
    }
    travelled += advance;
  });

  // A group's layout is derived from its children, so build it "raw" and then
  // correct the origin: the arc's centre of mass is the y = radius point.
  const group = new Group(parts, {
    originX: 'center',
    originY: 'center',
    left: placement.left ?? 0,
    top: placement.top ?? 0,
    subTargetCheck: false,
    objectCaching: true,
    interactive: false,
    layoutManager: undefined,
  });

  group.set({ plmType: 'text', plmArc: true });
  return group;
}

/**
 * Compose an SVG preview of a text config (used for layer thumbnails and the
 * inspector's live specimen).
 * @param {TextConfig} cfg
 * @param {{width?: number, height?: number}} [size]
 * @returns {string}
 */
export function textPreviewSvg(cfg, size = { width: 260, height: 90 }) {
  const { width: w, height: h } = size;
  const content = cfg.uppercase ? cfg.text.toUpperCase() : cfg.text;
  const shadow = cfg.shadowDepth
    ? `<filter id="ts"><feDropShadow dx="${cfg.shadowDepth * 0.4}" dy="${cfg.shadowDepth * 0.6}" stdDeviation="${
        cfg.shadowDepth * 0.7
      }" flood-opacity="0.65"/></filter>`
    : '';

  if (cfg.curve > 0) {
    // Approximate the arc with per-character placement in SVG.
    const font = `${cfg.italic ? 'italic ' : ''}${cfg.fontWeight} ${cfg.fontSize}px "${cfg.fontFamily}"`;
    const sweep = (Math.min(360, cfg.curve) * Math.PI) / 180;
    const advances = [...content].map((ch) => measure(ch, font) + cfg.letterSpacing);
    const total = advances.reduce((a, b) => a + b, 0) || 1;
    const radius = Math.min(total / sweep, Math.min(w, h * 2) * 0.62);
    const scale = (total / sweep) ? Math.min(1, radius / (total / sweep)) : 1;
    let travelled = 0;
    const glyphs = [...content]
      .map((ch, i) => {
        const advance = advances[i];
        const angle = -sweep / 2 + ((travelled + advance / 2) / total) * sweep;
        travelled += advance;
        if (!ch.trim()) return '';
        const x = w / 2 + Math.sin(angle) * radius;
        const y = h / 2 + 22 - Math.cos(angle) * radius;
        return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${cfg.fill}" font-family="${cfg.fontFamily}" font-size="${(
          cfg.fontSize * scale * 0.95
        ).toFixed(1)}" font-weight="${cfg.fontWeight}" text-anchor="middle" transform="rotate(${(
          (angle * 180) /
          Math.PI
        ).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${escapeXml(ch)}</text>`;
      })
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs>${shadow}</defs><g ${
      cfg.shadowDepth ? 'filter="url(#ts)"' : ''
    }>${glyphs}</g></svg>`;
  }

  const display = content.length > 18 ? `${content.slice(0, 17)}…` : content;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs>${shadow}</defs><text x="${
    w / 2
  }" y="${h / 2}" fill="${cfg.fill}" font-family="${cfg.fontFamily}" font-size="${Math.min(
    34,
    (w * 1.5) / Math.max(6, display.length),
  )}" font-weight="${cfg.fontWeight}" text-anchor="middle" dominant-baseline="middle" ${
    cfg.shadowDepth ? 'filter="url(#ts)"' : ''
  }>${escapeXml(display)}</text></svg>`;
}

/**
 * Escape text for inline SVG.
 * @param {string} s
 */
export function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
