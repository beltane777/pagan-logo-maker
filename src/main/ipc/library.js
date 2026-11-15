/**
 * @file src/main/ipc/library.js
 * @description Serves the bundled offline asset library to the renderer.
 *
 * The renderer runs with `contextIsolation` on and cannot read arbitrary disk
 * paths, so it asks the main process for SVG source on demand. Requests are
 * confined to the bundled `assets/svgs` directory and the user's vault — a
 * path outside those roots is rejected.
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * Resolve a requested asset id to an absolute path inside `root`, refusing
 * anything that escapes it (defence against `../` traversal).
 * @param {string} root
 * @param {string} relative
 * @returns {string|null}
 */
function safeJoin(root, relative) {
  const resolved = path.resolve(root, relative);
  const normalisedRoot = path.resolve(root) + path.sep;
  return resolved.startsWith(normalisedRoot) ? resolved : null;
}

/**
 * Register asset-library IPC handlers.
 * @param {import('electron').IpcMain} ipcMain
 * @param {{assetRoot: string, vaultDir: string}} ctx
 */
function registerLibraryHandlers(ipcMain, ctx) {
  /**
   * Read one SVG from the bundled library.
   * Expects `assets/svgs/<group>/<id>.svg` style relative paths.
   */
  ipcMain.handle('library:read-svg', async (_event, relativePath) => {
    if (typeof relativePath !== 'string') return { error: 'Invalid path' };
    const target = safeJoin(ctx.assetRoot, relativePath);
    if (!target) return { error: 'Path outside the asset library' };
    try {
      return { svg: await fs.readFile(target, 'utf8') };
    } catch (error) {
      return { error: String(error.message || error) };
    }
  });

  /** Read one SVG the user previously imported into their vault. */
  ipcMain.handle('library:read-vault-svg', async (_event, relativePath) => {
    if (typeof relativePath !== 'string') return { error: 'Invalid path' };
    const target = safeJoin(ctx.vaultDir, relativePath);
    if (!target) return { error: 'Path outside the vault' };
    try {
      return { svg: await fs.readFile(target, 'utf8') };
    } catch (error) {
      return { error: String(error.message || error) };
    }
  });

  /** List the user's vault contents (SVG + raster imports). */
  ipcMain.handle('library:list-vault', async () => {
    try {
      const entries = await fs.readdir(ctx.vaultDir, { withFileTypes: true });
      return {
        items: entries
          .filter((e) => e.isFile() && /\.(svg|png|jpe?g|webp)$/i.test(e.name))
          .map((e) => ({
            name: e.name.replace(/-\d+\.\w+$/, '').replace(/\.\w+$/, ''),
            file: e.name,
            kind: /\.svg$/i.test(e.name) ? 'svg' : 'raster',
          })),
      };
    } catch {
      return { items: [] };
    }
  });

  /** Resolve the absolute path of a vault file for display via `file://`. */
  ipcMain.handle('library:vault-url', async (_event, file) => {
    if (typeof file !== 'string') return { error: 'Invalid file' };
    const target = safeJoin(ctx.vaultDir, file);
    if (!target) return { error: 'Path outside the vault' };
    return { url: `file://${target.replace(/\\/g, '/')}` };
  });

  /** Report library + app metadata for the About modal. */
  ipcMain.handle('app:info', async (_event, meta) => ({ ...meta }));
}

module.exports = { registerLibraryHandlers };
