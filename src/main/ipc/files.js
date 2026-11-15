/**
 * @file src/main/ipc/files.js
 * @description Native file-system IPC surface. All dialogs and disk access live
 * here so the renderer stays sandboxed — it can only ask the main process to do
 * these things through the narrow, whitelisted preload bridge.
 *
 * Channels are namespaced `file:*` and every handler validates its arguments.
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog, shell, BrowserWindow, app } = require('electron');

/** @typedef {{canceled: boolean, filePath?: string, data?: string, name?: string, error?: string}} FileResult */

/** Ensure we have a window to parent dialogs to. */
const parent = (event) => BrowserWindow.fromWebContents(event.sender);

/**
 * Project filter definition shared by open/save dialogs.
 * @param {string} label
 * @param {string[]} ext
 */
const filter = (label, ext) => ({ name: label, extensions: ext });

/**
 * Register file-related IPC handlers.
 * @param {import('electron').IpcMain} ipcMain
 * @param {{vaultDir: string, recents: {get: Function, set: Function}}} ctx
 */
function registerFileHandlers(ipcMain, ctx) {
  /* ───────────────────────────── projects ───────────────────────────── */

  ipcMain.handle('file:save-project', async (event, payload) => {
    const { json, filePath, suggestedName } = payload || {};
    if (typeof json !== 'string') return { canceled: true, error: 'No data supplied' };

    let target = filePath;
    if (!target) {
      const { canceled, filePath: chosen } = await dialog.showSaveDialog(parent(event), {
        title: 'Save Project',
        defaultPath: path.join(
          app.getPath('documents'),
          `${(suggestedName || 'Untitled Sigil').replace(/[^\w\- ]+/g, '')}.plogo`,
        ),
        filters: [filter('Pagan Logo Maker Project', ['plogo']), filter('JSON', ['json'])],
      });
      if (canceled || !chosen) return { canceled: true };
      target = chosen;
    }

    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, json, 'utf8');
      addRecent(target, ctx);
      return { canceled: false, filePath: target, name: path.basename(target, path.extname(target)) };
    } catch (error) {
      return { canceled: false, error: String(error.message || error) };
    }
  });

  ipcMain.handle('file:open-project', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(parent(event), {
      title: 'Open Project',
      properties: ['openFile'],
      filters: [filter('Pagan Logo Maker Project', ['plogo', 'json'])],
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    return readProjectFile(filePaths[0], ctx);
  });

  ipcMain.handle('file:read-project', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return { canceled: true };
    return readProjectFile(filePath, ctx);
  });

  /* ───────────────────────────── export ────────────────────────────── */

  ipcMain.handle('file:export', async (event, payload) => {
    const { dataUrl, format = 'png', suggestedName = 'sigil', scale = 1, filePath } = payload || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return { canceled: false, error: 'Invalid image data' };
    }

    const ext = String(format).toLowerCase();
    let target = filePath;
    if (!target) {
      const { canceled, filePath: chosen } = await dialog.showSaveDialog(parent(event), {
        title: 'Export Design',
        defaultPath: path.join(
          app.getPath('pictures'),
          `${suggestedName.replace(/[^\w\- ]+/g, '')}${scale > 1 ? `@${Math.round(scale)}x` : ''}.${ext}`,
        ),
        filters: [filter(`${ext.toUpperCase()} image`, [ext])],
      });
      if (canceled || !chosen) return { canceled: true };
      target = chosen;
    }

    try {
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, Buffer.from(base64, 'base64'));
      return { canceled: false, filePath: target };
    } catch (error) {
      return { canceled: false, error: String(error.message || error) };
    }
  });

  /** Export raw text (SVG markup) to disk. */
  ipcMain.handle('file:export-text', async (event, payload) => {
    const { text, format = 'svg', suggestedName = 'sigil', filePath } = payload || {};
    if (typeof text !== 'string') return { canceled: false, error: 'Invalid export text' };

    let target = filePath;
    if (!target) {
      const { canceled, filePath: chosen } = await dialog.showSaveDialog(parent(event), {
        title: 'Export Vector',
        defaultPath: path.join(app.getPath('pictures'), `${suggestedName.replace(/[^\w\- ]+/g, '')}.${format}`),
        filters: [filter(`${format.toUpperCase()} vector`, [format])],
      });
      if (canceled || !chosen) return { canceled: true };
      target = chosen;
    }

    try {
      await fs.writeFile(target, text, 'utf8');
      return { canceled: false, filePath: target };
    } catch (error) {
      return { canceled: false, error: String(error.message || error) };
    }
  });

  /* ─────────────────────── asset import / vault ─────────────────────── */

  ipcMain.handle('file:import-asset', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(parent(event), {
      title: 'Import Vector or Image',
      properties: ['openFile', 'multiSelections'],
      filters: [
        filter('Vector & Image', ['svg', 'png', 'jpg', 'jpeg', 'webp']),
        filter('SVG', ['svg']),
        filter('Raster', ['png', 'jpg', 'jpeg', 'webp']),
      ],
    });
    if (canceled || !filePaths?.length) return { canceled: true, items: [] };

    const items = [];
    for (const p of filePaths) {
      try {
        const ext = path.extname(p).slice(1).toLowerCase();
        const name = path.basename(p, path.extname(p));
        if (ext === 'svg') {
          items.push({ kind: 'svg', name, contents: await fs.readFile(p, 'utf8') });
        } else {
          const buf = await fs.readFile(p);
          const mime = ext === 'jpg' ? 'jpeg' : ext;
          items.push({ kind: 'raster', name, dataUrl: `data:image/${mime};base64,${buf.toString('base64')}` });
        }
      } catch (error) {
        items.push({ kind: 'error', name: path.basename(p), error: String(error.message || error) });
      }
    }
    return { canceled: false, items };
  });

  /**
   * Copy an imported asset into the user's vault (`userData/user-vault`) so the
   * library survives restarts.
   */
  ipcMain.handle('file:save-to-vault', async (_event, payload) => {
    const { name = 'asset', contents, dataUrl } = payload || {};
    const safe = String(name).replace(/[^\w\- ]+/g, '').slice(0, 60) || 'asset';
    try {
      await fs.mkdir(ctx.vaultDir, { recursive: true });
      if (typeof contents === 'string') {
        const target = path.join(ctx.vaultDir, `${safe}-${Date.now()}.svg`);
        await fs.writeFile(target, contents, 'utf8');
        return { canceled: false, path: target };
      }
      if (typeof dataUrl === 'string') {
        const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
        const ext = mime.split('/')[1].replace('jpeg', 'jpg');
        const target = path.join(ctx.vaultDir, `${safe}-${Date.now()}.${ext}`);
        await fs.writeFile(target, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
        return { canceled: false, path: target };
      }
      return { canceled: false, error: 'Nothing to write' };
    } catch (error) {
      return { canceled: false, error: String(error.message || error) };
    }
  });

  ipcMain.handle('shell:open-vault-folder', async () => {
    await fs.mkdir(ctx.vaultDir, { recursive: true });
    return shell.openPath(ctx.vaultDir);
  });

  ipcMain.handle('shell:show-item', async (_event, filePath) => {
    if (typeof filePath === 'string' && filePath) shell.showItemInFolder(filePath);
    return true;
  });

  /* ───────────────────────────── recents ───────────────────────────── */

  ipcMain.handle('file:recents', () => ctx.recents.get('list', []));
  ipcMain.handle('file:clear-recents', () => {
    ctx.recents.set('list', []);
    return [];
  });
}

/**
 * Read + parse a `.plogo` project file, updating the recents list.
 * @param {string} filePath
 * @param {{recents: {get: Function, set: Function}}} ctx
 */
async function readProjectFile(filePath, ctx) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const project = JSON.parse(raw);
    addRecent(filePath, ctx);
    return {
      canceled: false,
      filePath,
      project,
      name: path.basename(filePath, path.extname(filePath)),
    };
  } catch (error) {
    return { canceled: false, error: String(error.message || error), filePath };
  }
}

/**
 * Push a path onto the MRU recents list (max 10, de-duplicated).
 * @param {string} filePath
 * @param {{recents: {get: Function, set: Function}}} ctx
 */
function addRecent(filePath, ctx) {
  const list = (ctx.recents.get('list', []) || []).filter((r) => r.path !== filePath);
  list.unshift({ path: filePath, name: path.basename(filePath, path.extname(filePath)) });
  ctx.recents.set('list', list.slice(0, 10));
  if (typeof ctx.onRecentsChanged === 'function') ctx.onRecentsChanged(ctx.recents.get('list', []));
}

module.exports = { registerFileHandlers };
