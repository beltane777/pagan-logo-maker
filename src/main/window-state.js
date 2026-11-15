/**
 * @file src/main/window-state.js
 * @description Persists and restores BrowserWindow geometry (position, size and
 * maximised/full-screen flags) across sessions, with guards against restoring a
 * window onto a display that no longer exists.
 */

'use strict';

const { screen } = require('electron');

const DEFAULT_BOUNDS = { width: 1440, height: 900, x: undefined, y: undefined };

/**
 * True when a saved rectangle overlaps at least one display's work area.
 * @param {{x:number,y:number,width:number,height:number}} b
 * @returns {boolean}
 */
function isVisibleOnSomeDisplay(b) {
  return screen.getAllDisplays().some((display) => {
    const a = display.workArea;
    return (
      b.x < a.x + a.width &&
      b.x + b.width > a.x &&
      b.y < a.y + a.height &&
      b.y + b.height > a.y
    );
  });
}

/**
 * Restore (or create) window bounds from a store.
 * @param {ReturnType<typeof import('./store').createStore>} store
 * @returns {{x:number|undefined,y:number|undefined,width:number,height:number,maximized:boolean,fullScreen:boolean}}
 */
function restore(store) {
  const saved = store.get('bounds', null);
  const maximized = !!store.get('maximized', false);
  const fullScreen = !!store.get('fullScreen', false);

  if (!saved || !isVisibleOnSomeDisplay(saved)) {
    return { ...DEFAULT_BOUNDS, maximized, fullScreen };
  }
  return {
    ...saved,
    width: Math.max(saved.width ?? DEFAULT_BOUNDS.width, 1100),
    height: Math.max(saved.height ?? DEFAULT_BOUNDS.height, 700),
    maximized,
    fullScreen,
  };
}

/**
 * Persist window geometry. Debounced by the caller's resize/move events.
 * @param {ReturnType<typeof import('./store').createStore>} store
 * @param {import('electron').BrowserWindow} win
 */
function track(store, win) {
  let timer = null;

  const save = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    // `getNormalBounds` returns pre-maximise bounds, which is what we want.
    store.set({
      bounds: win.getNormalBounds(),
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen(),
    });
  };

  const saveSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };

  win.on('resize', saveSoon);
  win.on('move', saveSoon);
  win.on('maximize', saveSoon);
  win.on('unmaximize', saveSoon);
  win.on('close', () => {
    clearTimeout(timer);
    save();
  });
}

module.exports = { restore, track };
