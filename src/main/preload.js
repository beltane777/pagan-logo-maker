/**
 * @file src/main/preload.js
 * @description The only bridge between the sandboxed renderer and Node. Exposes
 * a small, explicitly-whitelisted `window.desktop` API. No Node primitives are
 * leaked to the page.
 *
 * The renderer detects Electron via `window.desktop?.isElectron` and falls back
 * to browser APIs (downloads + file inputs) when running in a plain browser,
 * which keeps `npm run dev:renderer` usable for UI work.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** @typedef {{command: string, payload?: any}} MenuMessage */

/**
 * Invoke helper with a uniform error shape so renderer callers never see raw
 * IPC rejections.
 * @param {string} channel
 * @param {*} [args]
 */
const invoke = async (channel, args) => {
  try {
    return await ipcRenderer.invoke(channel, args);
  } catch (error) {
    return { error: String(error?.message || error) };
  }
};

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },

  /* ── project files ─────────────────────────────────────────────────── */
  files: {
    /** @param {{json: string, filePath?: string, suggestedName?: string}} payload */
    saveProject: (payload) => invoke('file:save-project', payload),
    openProject: () => invoke('file:open-project'),
    /** @param {string} filePath */
    readProject: (filePath) => invoke('file:read-project', filePath),
    /** @param {{dataUrl: string, format: string, suggestedName?: string, scale?: number, filePath?: string}} payload */
    exportImage: (payload) => invoke('file:export', payload),
    /** @param {{text: string, format: string, suggestedName?: string}} payload */
    exportText: (payload) => invoke('file:export-text', payload),
    importAsset: () => invoke('file:import-asset'),
    /** @param {{name: string, contents?: string, dataUrl?: string}} payload */
    saveToVault: (payload) => invoke('file:save-to-vault', payload),
    recents: () => invoke('file:recents'),
    clearRecents: () => invoke('file:clear-recents'),
  },

  /* ── bundled asset library ─────────────────────────────────────────── */
  library: {
    /** @param {string} relativePath e.g. `symbols/pentacle.svg` */
    readSvg: (relativePath) => invoke('library:read-svg', relativePath),
    /** @param {string} file */
    readVaultSvg: (file) => invoke('library:read-vault-svg', file),
    listVault: () => invoke('library:list-vault'),
    /** @param {string} file */
    vaultUrl: (file) => invoke('library:vault-url', file),
  },

  /* ── shell integration ─────────────────────────────────────────────── */
  shell: {
    openVaultFolder: () => invoke('shell:open-vault-folder'),
    /** @param {string} filePath */
    showItem: (filePath) => invoke('shell:show-item', filePath),
  },

  /**
   * Subscribe to native menu commands.
   * @param {(msg: MenuMessage) => void} handler
   * @returns {() => void} unsubscribe
   */
  onMenuCommand: (handler) => {
    /** @param {Electron.IpcRendererEvent} _e @param {MenuMessage} msg */
    const listener = (_e, msg) => handler(msg);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },

  /**
   * Subscribe to recents-list changes pushed from the main process.
   * @param {(list: Array<{path: string, name: string}>) => void} handler
   * @returns {() => void} unsubscribe
   */
  onRecents: (handler) => {
    const listener = (_e, list) => handler(list);
    ipcRenderer.on('recents:changed', listener);
    return () => ipcRenderer.removeListener('recents:changed', listener);
  },

  /** Fire-and-forget window-level commands (e.g. `close-export-modal`). */
  notify: (channel, payload) => ipcRenderer.send(channel, payload),
});
