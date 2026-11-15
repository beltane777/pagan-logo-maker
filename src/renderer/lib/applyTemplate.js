/**
 * @file src/renderer/lib/applyTemplate.js
 * @description Replays a template recipe onto the canvas engine.
 *
 * Templates store *fractions* of the artboard rather than pixels, so the same
 * recipe looks correct at any canvas size. Each layer is translated into an
 * engine call, in bottom-to-top order.
 *
 * @see ../assets/templates.js for the recipes
 * @see ../canvas/engine.js for the primitives being orchestrated
 */

import { getAllAssets } from './assetLibrary';
import { loadAsset } from './assetLibrary';
import { DEFAULT_TEXT } from '../canvas/text';

/** Asset manifest indexed by id, for O(1) template lookups. */
const assetIndex = new Map(getAllAssets().map((a) => [a.id, a]));

/**
 * Place every layer of a template.
 *
 * @param {import('../canvas/engine').CanvasEngine} engine
 * @param {object} template
 * @param {{viewport: {width:number, height:number}}} opts
 * @returns {Promise<{placed: number, missing: string[]}>}
 */
export async function applyTemplate(engine, template, opts) {
  const { artboard } = template;

  // 1. Resize the stage to the template's artboard first.
  engine.setArtboard(artboard, opts.viewport);
  engine.zoomFit();

  const missing = [];
  let placed = 0;

  // 2. Replay layers bottom → top.
  for (const layer of template.layers) {
    if (layer.type === 'symbol') {
      const meta = assetIndex.get(layer.assetId);
      if (!meta) {
        missing.push(layer.assetId);
        continue;
      }
      const asset = await loadAsset(meta);
      const size = layer.size ?? 0.6;
      await engine.addSymbol(asset, layer.finish || 'gold', {
        left: (layer.x ?? 0.5) * artboard.width,
        top: (layer.y ?? 0.5) * artboard.height,
        // Library art is drawn on a 256 grid; convert the desired fraction of
        // the artboard's *short* edge into a Fabric scale factor.
        scale: (Math.min(artboard.width, artboard.height) * size) / 256,
      });
      placed++;
    } else if (layer.type === 'text') {
      const cfg = {
        ...DEFAULT_TEXT,
        text: layer.text,
        fontFamily: layer.font || DEFAULT_TEXT.fontFamily,
        fontSize: layer.fontSize ?? 48,
        fill: layer.fill || '#d4af4f',
        curve: layer.curve ?? 0,
        letterSpacing: layer.letterSpacing ?? 4,
        shadowDepth: layer.shadow ?? 0,
      };
      await engine.addText(cfg, {
        left: (layer.x ?? 0.5) * artboard.width,
        top: (layer.y ?? 0.5) * artboard.height,
      });
      placed++;
    }
  }

  engine.deselect();
  return { placed, missing };
}

/**
 * Render a small preview of a template (used by the template gallery).
 * Composes the same symbols at thumbnail scale as a single SVG string.
 *
 * @param {object} template
 * @param {number} size thumbnail edge length in px
 * @returns {Promise<string>} SVG markup
 */
export async function templatePreviewSvg(template, size = 180) {
  const { artboard } = template;
  const parts = [];

  for (const layer of template.layers) {
    if (layer.type === 'symbol') {
      const meta = assetIndex.get(layer.assetId);
      if (!meta) continue;
      try {
        const { svg } = await loadAsset(meta);
        const inner = svg
          .replace(/^[\s\S]*?<svg[^>]*>/, '')
          .replace(/<\/svg>[\s\S]*$/, '')
          .replace(/<title>[\s\S]*?<\/title>/g, '');
        const w = Math.min(artboard.width, artboard.height) * (layer.size ?? 0.6);
        const scale = (w / artboard.width) * size / 256;
        const cx = (layer.x ?? 0.5) * size;
        const cy = (layer.y ?? 0.5) * size;
        parts.push(
          `<g transform="translate(${(cx - 128 * scale).toFixed(2)} ${(cy - 128 * scale).toFixed(
            2,
          )}) scale(${scale.toFixed(4)})">${inner}</g>`,
        );
      } catch {
        /* skip unreadable assets */
      }
    } else if (layer.type === 'text') {
      const fs = ((layer.fontSize ?? 48) / artboard.width) * size;
      const x = (layer.x ?? 0.5) * size;
      const y = (layer.y ?? 0.5) * size;
      const text = String(layer.text || '').slice(0, 30);
      parts.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${
          layer.fill || '#d4af4f'
        }" font-family="${layer.font || 'Cinzel Decorative'}" font-size="${fs.toFixed(
          1,
        )}" text-anchor="middle" dominant-baseline="middle">${text.replace(/[<>&]/g, '')}</text>`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${
    artboard.background || '#0d0c12'
  }"/>${parts.join('')}</svg>`;
}
