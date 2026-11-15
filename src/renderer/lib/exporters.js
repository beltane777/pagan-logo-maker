/**
 * @file src/renderer/lib/exporters.js
 * @description Export pipeline: turns engine output into files on disk.
 *
 * Formats:
 *   • `png`  — lossless raster, optional transparency, up to 4× artboard
 *   • `jpeg` — flattened photo-style output with quality control
 *   • `svg`  — true vector, editable in Illustrator/Inkscape
 *   • `plogo` — native project file (JSON)
 *
 * In Electron, writes go through the preload bridge (native Save dialog).
 * In a plain browser, we fall back to an anchor download so the preview build
 * stays fully functional.
 */

/** Preset export sizes, expressed as a multiplier of the artboard. */
export const SIZE_PRESETS = [
  { id: 'web', label: 'Web (1×)', multiplier: 1, note: 'Fastest, screen-ready' },
  { id: 'print', label: 'Print (2×)', multiplier: 2, note: 'Good for print proofs' },
  { id: 'high', label: 'High (3×)', multiplier: 3, note: 'Large format' },
  { id: 'uhd', label: 'Ultra (4×)', multiplier: 4, note: '4K / archival' },
];

/**
 * Pixel dimensions for a preset.
 * @param {{width:number,height:number}} artboard
 * @param {number} multiplier
 */
export const outputSize = (artboard, multiplier) => ({
  width: Math.round(artboard.width * multiplier),
  height: Math.round(artboard.height * multiplier),
});

/**
 * Trigger a browser download for a data URL or blob URL.
 * @param {string} url
 * @param {string} filename
 */
function browserDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Sanitise a project name into a filename stem.
 * @param {string} name
 */
export const safeName = (name) =>
  (name || 'sigil')
    .replace(/[^\w\-. ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'sigil';

/**
 * Export a raster image.
 *
 * @param {import('../canvas/engine').CanvasEngine} engine
 * @param {Object} opts
 * @param {'png'|'jpeg'} opts.format
 * @param {number} opts.multiplier
 * @param {boolean} [opts.transparent]
 * @param {string} opts.projectName
 * @param {string} [opts.filePath] explicit destination (Electron only)
 * @returns {Promise<{ok: boolean, filePath?: string, error?: string, canceled?: boolean}>}
 */
export async function exportRaster(engine, opts) {
  const { format, multiplier, transparent = false, projectName, filePath } = opts;
  const dataUrl = engine.exportRaster(format, multiplier, { transparent });
  const stem = safeName(projectName);
  const suffix = multiplier > 1 ? `@${multiplier}x` : '';

  if (window.desktop?.files?.exportImage) {
    return window.desktop.files.exportImage({
      dataUrl,
      format,
      scale: multiplier,
      suggestedName: `${stem}${suffix}`,
      filePath,
    });
  }

  browserDownload(dataUrl, `${stem}${suffix}.${format === 'jpeg' ? 'jpg' : format}`);
  return { ok: true };
}

/**
 * Export vector SVG.
 * @param {import('../canvas/engine').CanvasEngine} engine
 * @param {{projectName: string, transparent?: boolean, filePath?: string}} opts
 */
export async function exportVector(engine, opts) {
  const { projectName, transparent = false, filePath } = opts;
  const svg = engine.exportSvg({ transparent });
  const stem = safeName(projectName);

  if (window.desktop?.files?.exportText) {
    return window.desktop.files.exportText({ text: svg, format: 'svg', suggestedName: stem, filePath });
  }

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  browserDownload(URL.createObjectURL(blob), `${stem}.svg`);
  return { ok: true };
}

/**
 * Serialise + save the current project.
 * @param {import('../canvas/engine').CanvasEngine} engine
 * @param {{artboard: object, meta: object}} state
 * @param {{filePath?: string|null, saveAs?: boolean}} opts
 */
export async function saveProject(engine, state, opts = {}) {
  const doc = engine.toDocument(state);
  const json = JSON.stringify(doc, null, 2);

  if (window.desktop?.files?.saveProject) {
    const result = await window.desktop.files.saveProject({
      json,
      filePath: opts.saveAs ? undefined : opts.filePath || undefined,
      suggestedName: doc.meta?.name,
    });
    if (result?.canceled) return { canceled: true };
    if (result?.error) return { ok: false, error: result.error };
    return { ok: true, filePath: result.filePath, name: result.name };
  }

  // Browser fallback
  const blob = new Blob([json], { type: 'application/json' });
  browserDownload(URL.createObjectURL(blob), `${safeName(doc.meta?.name)}.plogo`);
  return { ok: true };
}

/**
 * Read a `.plogo` project from disk (Electron) — browser path uses a file input.
 * @param {File} [file]
 */
export async function openProject(file) {
  if (file) {
    const text = await file.text();
    return { ok: true, project: JSON.parse(text), name: file.name.replace(/\.plogo$/, '') };
  }
  if (!window.desktop?.files?.openProject) return { canceled: true };
  const result = await window.desktop.files.openProject();
  if (result?.canceled) return { canceled: true };
  if (result?.error) return { ok: false, error: result.error };
  return { ok: true, project: result.project, filePath: result.filePath, name: result.name };
}

/**
 * Format a byte count for the status bar.
 * @param {number} px total pixels
 */
export const describePixels = (px) => `${(px / 1_000_000).toFixed(1)} MP`;
