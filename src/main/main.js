/**
 * @file src/main/main.js
 * @description Electron main process entry point.
 *
 * Responsibilities:
 *   1. Single-instance locking (focuses the running window on relaunch).
 *   2. Secure BrowserWindow creation — `contextIsolation`, `nodeIntegration:
 *      false`, `sandbox: true`, and a strict CSP for the packaged renderer.
 *   3. Window-state persistence, native menu, and IPC wiring.
 *   4. Dev vs. production loading (Vite dev server vs. bundled `dist/`).
 *
 * Path conventions:
 *   dev  →  src/main/main.js, renderer served from http://localhost:5173
 *   prod →  <app.asar>/src/main/main.js, renderer from <app.asar>/dist/index.html
 *           bundled assets at <app.asar>/assets/svgs
 *
 * @see ./ipc/files.js, ./ipc/library.js, ./menu.js, ./window-state.js
 */

'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, crashReporter } = require('electron');

const { createStore } = require('./store');
const windowState = require('./window-state');
const { installMenu, updateRecents } = require('./menu');
const { registerFileHandlers } = require('./ipc/files');
const { registerLibraryHandlers } = require('./ipc/library');

const isDev = !app.isPackaged;
const APP_ROOT = path.join(__dirname, '..', '..');
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

/** Bundled read-only artwork (shipped inside the asar). */
const ASSET_ROOT = path.join(APP_ROOT, 'assets', 'svgs');
/** User imports, persisted in the OS app-data directory. */
const VAULT_DIR = path.join(app.getPath('userData'), 'user-vault');

/** @type {BrowserWindow|null} */
let mainWindow = null;
/** @type {ReturnType<typeof createStore>|null} */
let windowStore = null;

/* ─────────────────────────── single instance ─────────────────────────── */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

/* ─────────────────────────────── window ──────────────────────────────── */

/**
 * Create the primary application window.
 * @returns {BrowserWindow}
 */
function createMainWindow() {
  const bounds = windowState.restore(windowStore);

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0c0b10',
    title: 'Pagan Logo Maker',
    icon: path.join(APP_ROOT, 'build', process.platform === 'win32' ? 'icon.ico' : 'icons', '512x512.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webgl: true,
      backgroundThrottling: false,
    },
  });

  if (bounds.maximized) mainWindow.maximize();
  if (bounds.fullScreen) mainWindow.setFullScreen(true);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  windowState.track(windowStore, mainWindow);

  // Never let the app navigate away from its own UI; open links externally.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_SERVER_URL) : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(APP_ROOT, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/* ──────────────────────────── app lifecycle ──────────────────────────── */

app.whenReady().then(() => {
  crashReporter.start({ submitURL: '', uploadToServer: false, compress: false });

  const settingsDir = path.join(app.getPath('userData'), 'settings');

  windowStore = createStore({
    name: 'window-state',
    dir: settingsDir,
    defaults: { bounds: null, maximized: false, fullScreen: false },
  });

  const recents = createStore({
    name: 'recents',
    dir: settingsDir,
    defaults: { list: [] },
  });

  const ctx = {
    assetRoot: ASSET_ROOT,
    vaultDir: VAULT_DIR,
    recents,
    /** Push recents to both the renderer and the native menu. */
    onRecentsChanged: (list) => {
      updateRecents(list);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('recents:changed', list);
      }
    },
  };

  registerFileHandlers(ipcMain, ctx);
  registerLibraryHandlers(ipcMain, ctx);

  installMenu({
    isDev,
    onAbout: () => {
      if (mainWindow) mainWindow.webContents.send('menu:command', { command: 'open-about' });
    },
  });
  updateRecents(recents.get('list', []));

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ───────────────────────────── diagnostics ───────────────────────────── */

app.on('render-process-gone', (_event, _contents, details) => {
  console.error('[main] renderer gone:', details.reason);
});

process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception', err);
});

module.exports = { ASSET_ROOT, VAULT_DIR };
