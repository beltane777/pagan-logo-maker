#!/usr/bin/env node
/**
 * @file scripts/generate-icons.mjs
 * @description Renders the application icon set from a single source-of-truth
 * SVG (the sigil mark), using `sharp` for rasterisation and `png-to-ico` for
 * the Windows container.
 *
 * Outputs (consumed by `electron-builder`, see the `build` block in package.json):
 *   build/icon.ico             Windows 16–256 px multi-size icon
 *   build/icon.icns            macOS bundle icon (PNG-in-ICNS, 1024 px)
 *   build/icons/<N>x<N>.png    Linux icon theme sizes
 *   build/icon.png             1024 px master (used by the About dialog)
 *
 * Run with: `npm run icons` (also runs automatically before `npm run dist`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUILD = path.join(ROOT, 'build');
const ICONS = path.join(BUILD, 'icons');

/* ───────────────────────────── artwork ───────────────────────────────── */

/**
 * The brand mark: a gold sigil — crescent + star inside a doubled ring, on a
 * deep violet ground with a subtle inner glow.
 *
 * Drawn at 1024×1024 so every derivative downscales cleanly.
 */
const SOURCE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b1826"/>
      <stop offset="0.55" stop-color="#121019"/>
      <stop offset="1" stop-color="#07060a"/>
    </linearGradient>
    <linearGradient id="gold" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#fbf3d8"/>
      <stop offset="0.28" stop-color="#e3c878"/>
      <stop offset="0.55" stop-color="#b8912f"/>
      <stop offset="0.72" stop-color="#f0dfa4"/>
      <stop offset="1" stop-color="#6b4f16"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#d4af4f" stop-opacity="0.28"/>
      <stop offset="0.65" stop-color="#d4af4f" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#d4af4f" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <!-- Crescent built from a mask rather than arc flags: two circles always
         describe the shape unambiguously, at any radius. -->
    <mask id="crescent">
      <rect width="1024" height="1024" fill="#000"/>
      <circle cx="486" cy="512" r="238" fill="#fff"/>
      <circle cx="628" cy="512" r="186" fill="#000"/>
    </mask>
  </defs>

  <!-- Rounded-square ground (Windows/macOS style) -->
  <rect x="0" y="0" width="1024" height="1024" rx="224" fill="url(#ground)"/>
  <rect x="0" y="0" width="1024" height="1024" rx="224" fill="url(#halo)"/>

  <!-- Outer + inner rings -->
  <circle cx="512" cy="512" r="392" fill="none" stroke="url(#gold)" stroke-width="20"/>
  <circle cx="512" cy="512" r="352" fill="none" stroke="url(#gold)" stroke-width="7" opacity="0.6"/>

  <!-- Tick marks around the ring -->
  <g stroke="url(#gold)" stroke-width="9" stroke-linecap="round" opacity="0.85">
    ${Array.from({ length: 32 }, (_, i) => {
      const a = (i * Math.PI * 2) / 32 - Math.PI / 2;
      const r1 = i % 4 === 0 ? 316 : 332;
      const r2 = 352;
      return `<line x1="${(512 + Math.cos(a) * r1).toFixed(1)}" y1="${(
        512 +
        Math.sin(a) * r1
      ).toFixed(1)}" x2="${(512 + Math.cos(a) * r2).toFixed(1)}" y2="${(
        512 +
        Math.sin(a) * r2
      ).toFixed(1)}"/>`;
    }).join('\n    ')}
  </g>

  <!-- Crescent moon -->
  <rect width="1024" height="1024" fill="url(#gold)" mask="url(#crescent)"/>

  <!-- Five-pointed star nestled in the crescent -->
  <path d="${(() => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 124 : 52;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      pts.push(`${(606 + Math.cos(a) * r).toFixed(1)} ${(512 + Math.sin(a) * r).toFixed(1)}`);
    }
    return `M${pts.join(' L')} Z`;
  })()}" fill="url(#gold)"/>

  <!-- Glow beneath the mark -->
  <circle cx="512" cy="512" r="150" fill="#d4af4f" opacity="0.18" filter="url(#soft)"/>
</svg>
`;

/* ──────────────────────────── generation ─────────────────────────────── */

const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Render the source SVG to a PNG buffer at a given size.
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
const render = (size) =>
  sharp(Buffer.from(SOURCE_SVG), { density: Math.max(72, (size / 1024) * 384) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

async function main() {
  fs.mkdirSync(ICONS, { recursive: true });

  // Linux icon theme + master
  for (const size of LINUX_SIZES) {
    await fs.promises.writeFile(path.join(ICONS, `${size}x${size}.png`), await render(size));
  }
  const master = await render(1024);
  await fs.promises.writeFile(path.join(BUILD, 'icon.png'), master);
  console.log('✔ build/icon.png + build/icons/*.png');

  // Windows .ico (multi-resolution)
  const icoBuffers = await Promise.all(ICO_SIZES.map((s) => render(s)));
  const ico = await pngToIco(icoBuffers);
  await fs.promises.writeFile(path.join(BUILD, 'icon.ico'), ico);
  console.log('✔ build/icon.ico');

  // macOS .icns — a minimal PNG-based container (valid for electron-builder).
  const icns = await buildIcns(master);
  await fs.promises.writeFile(path.join(BUILD, 'icon.icns'), icns);
  console.log('✔ build/icon.icns');
}

/**
 * Build a minimal `.icns` container embedding a 1024×1024 PNG.
 *
 * The ICNS format is a magic header followed by typed chunks. `ic10` is the
 * 1024 px retina PNG slot; including only that entry is valid and macOS falls
 * back to it for all other sizes. Keeping the generator dependency-free avoids
 * requiring macOS-only tooling (`iconutil`) on CI.
 *
 * @param {Buffer} png1024
 * @returns {Promise<Buffer>}
 */
async function buildIcns(png1024) {
  const type = Buffer.from('ic10', 'ascii'); // 1024×1024 @1x PNG
  const header = Buffer.alloc(8);
  header.write(type.toString('ascii'), 0, 4, 'ascii');
  header.writeUInt32BE(png1024.length + 8, 4);

  const chunk = Buffer.concat([header, png1024]);
  const total = Buffer.alloc(8);
  total.write('icns', 0, 4, 'ascii');
  total.writeUInt32BE(chunk.length + 8, 4);

  return Buffer.concat([total, chunk]);
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exitCode = 1;
});
