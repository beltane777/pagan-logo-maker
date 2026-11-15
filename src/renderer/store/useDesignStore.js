/**
 * @file src/renderer/store/useDesignStore.js
 * @description Centralised application state (Zustand).
 *
 * Three concerns are kept deliberately separate so Copilot can extend any of
 * them without touching the others:
 *
 *   1. **Document** — the serialisable design (`layers`, `artboard`, `meta`).
 *      Written by the canvas engine after every mutation.
 *   2. **UI** — panel visibility, active tool, modals, toasts.
 *   3. **History** — an undo/redo ring of document snapshots.
 *
 * The canvas engine ({@link module:canvas/engine}) is the only writer of
 * `layers`; React components read it and dispatch intents. This one-way flow
 * keeps Fabric.js and React from fighting over state.
 *
 * @see ./history.js for the snapshot ring implementation
 */

import { create } from 'zustand';
import { createSnapshotRing } from './history';

/** @typedef {import('../canvas/engine').LayerMeta} LayerMeta */

/** Default artboard settings for a fresh project. */
export const DEFAULT_ARTBOARD = {
  width: 1200,
  height: 1200,
  background: '#0d0c12',
  backgroundFinish: 'solid',
};

/** @typedef {'select'|'text'|'pan'|'shape'} Tool */

/**
 * UI defaults, exported so `reset()` can restore them.
 */
const UI_DEFAULTS = {
  /** @type {Tool} */
  tool: 'select',
  showVault: true,
  showInspector: true,
  showGrid: false,
  snapToGrid: false,
  gridSize: 40,
  showRulers: false,
  /** Canvas zoom multiplier, 1 = 100 %. */
  zoom: 1,
  /** @type {null|'export'|'about'|'shortcuts'|'templates'|'preferences'|'license'} */
  modal: null,
  /** @type {string|null} */
  projectName: 'Untitled Sigil',
  /** @type {string|null} absolute path of the saved project */
  filePath: null,
  /** Unsaved-changes flag. */
  dirty: false,
  /** @type {Array<{id: string, message: string, tone: 'ok'|'error'|'info'}>} */
  toasts: [],
  /** Currently expanded vault accordions. */
  vaultOpen: { symbols: true, frames: true, textures: false, custom: true },
  /** Search query for the vault. */
  vaultQuery: '',
  /** @type {string[]} ids of the imported (custom) assets in this session */
  customAssets: [],
};

export const useDesignStore = create((set, get) => {
  /** Snapshot ring shared across all document actions. */
  const history = createSnapshotRing({ limit: 80 });

  /**
   * Record a mutation: queue the previous document as the undo target, then
   * declare the new one as the current position.
   * @param {object} previous state before the mutation
   * @param {object} next state after the mutation
   */
  const record = (previous, next) => {
    history.push(previous);
    history.commit(next);
  };

  return {
    /* ───────────────────────── document ───────────────────────── */

    /** @type {import('../canvas/engine').DesignDocument} */
    doc: {
      version: 1,
      artboard: { ...DEFAULT_ARTBOARD },
      layers: [],
      meta: { name: 'Untitled Sigil', description: '', author: '', tags: [] },
    },

    /** @type {string[]} ids of the currently selected layers (top-most last) */
    selection: [],

    /* ───────────────────────────── ui ───────────────────────────── */

    ui: { ...UI_DEFAULTS },

    /* ────────────────────────── selectors ───────────────────────── */

    /** @returns {import('../canvas/engine').LayerMeta|null} */
    activeLayer: () => {
      const { doc, selection } = get();
      const id = selection[selection.length - 1];
      return doc.layers.find((l) => l.id === id) || null;
    },

    /* ──────────────────────── document setters ──────────────────── */

    /**
     * Replace the whole layer list (called by the engine after mutations).
     * @param {LayerMeta[]} layers
     * @param {{history?: boolean}} [opts] pass `{history:false}` for transient
     *   updates such as live slider drags
     */
    setLayers: (layers, opts = {}) => {
      const recordEntry = opts.history !== false;
      const state = get();
      const nextDoc = { ...state.doc, layers };
      if (recordEntry) record(snapshot(state.doc), nextDoc);

      set((s) => ({
        doc: nextDoc,
        ui: { ...s.ui, dirty: true },
        historyTick: recordEntry ? s.historyTick + 1 : s.historyTick,
      }));
      // Keep the selection consistent with what still exists.
      const ids = new Set(layers.map((l) => l.id));
      const selection = state.selection.filter((id) => ids.has(id));
      if (selection.length !== state.selection.length) set({ selection });
    },

    /**
     * Merge partial properties into one layer.
     * @param {string} id
     * @param {Partial<LayerMeta>} patch
     * @param {{history?: boolean}} [opts]
     */
    patchLayer: (id, patch, opts = {}) => {
      const state = get();
      const nextDoc = {
        ...state.doc,
        layers: state.doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      };
      if (opts.history !== false) record(snapshot(state.doc), nextDoc);
      set((s) => ({
        doc: nextDoc,
        ui: { ...s.ui, dirty: true },
        historyTick: opts.history === false ? s.historyTick : s.historyTick + 1,
      }));
    },

    /**
     * Update artboard properties.
     * @param {Partial<typeof DEFAULT_ARTBOARD>} patch
     * @param {{history?: boolean}} [opts]
     */
    setArtboard: (patch, opts = {}) => {
      const state = get();
      const nextDoc = { ...state.doc, artboard: { ...state.doc.artboard, ...patch } };
      if (opts.history !== false) record(snapshot(state.doc), nextDoc);
      set((s) => ({
        doc: nextDoc,
        ui: { ...s.ui, dirty: true },
        historyTick: opts.history === false ? s.historyTick : s.historyTick + 1,
      }));
    },

    /** @param {Partial<{name: string, description: string, author: string, tags: string[]}>} patch */
    setMeta: (patch) =>
      set((s) => ({ doc: { ...s.doc, meta: { ...s.doc.meta, ...patch } } })),

    /** @param {string[]} ids */
    setSelection: (ids) => set({ selection: ids }),

    /**
     * Replace the entire document (open project / new project / template).
     * @param {import('../canvas/engine').DesignDocument} doc
     * @param {{filePath?: string|null, name?: string, resetHistory?: boolean}} [opts]
     */
    loadDocument: (doc, opts = {}) => {
      if (opts.resetHistory !== false) {
        history.clear();
        history.commit(doc);
      }
      set((s) => ({
        doc,
        selection: [],
        ui: {
          ...s.ui,
          projectName: opts.name || doc.meta?.name || 'Untitled Sigil',
          filePath: opts.filePath ?? null,
          dirty: false,
        },
      }));
    },

    /* ─────────────────────────── history ────────────────────────── */

    /** Push the current document onto the undo stack (before a mutation). */
    checkpoint: () => {
      const doc = get().doc;
      history.push(snapshot(doc));
      history.commit(doc);
      set((s) => ({ historyTick: s.historyTick + 1 }));
    },

    /** @returns {boolean} whether an undo was performed */
    undo: () => {
      const previous = history.undo(snapshot(get().doc));
      if (!previous) return false;
      history.commit(previous);
      set((s) => ({ doc: previous, ui: { ...s.ui, dirty: true }, historyTick: s.historyTick + 1 }));
      return true;
    },

    /** @returns {boolean} */
    redo: () => {
      const next = history.redo(snapshot(get().doc));
      if (!next) return false;
      history.commit(next);
      set((s) => ({ doc: next, ui: { ...s.ui, dirty: true }, historyTick: s.historyTick + 1 }));
      return true;
    },

    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),

    /**
     * Bumped whenever the undo/redo stacks change. Components that need to
     * enable/disable toolbar buttons subscribe to this scalar and read the
     * stacks through {@link canUndo}/{@link canRedo} in the same render.
     */
    historyTick: 0,

    /* ───────────────────────────── ui ───────────────────────────── */

    /** @param {Partial<typeof UI_DEFAULTS>} patch */
    setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),

    /** @param {Tool} tool */
    setTool: (tool) => set((s) => ({ ui: { ...s.ui, tool } })),

    /** @param {string} id */
    toggleVaultSection: (id) =>
      set((s) => ({
        ui: { ...s.ui, vaultOpen: { ...s.ui.vaultOpen, [id]: !s.ui.vaultOpen[id] } },
      })),

    /** @param {string} message @param {'ok'|'error'|'info'} [tone] */
    toast: (message, tone = 'info') => {
      const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      set((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts, { id, message, tone }] } }));
      setTimeout(() => {
        set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } }));
      }, 3600);
    },

    /** @param {string} id */
    dismissToast: (id) =>
      set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } })),

    /** Mark the project as saved to a path. */
    markSaved: (filePath, name) =>
      set((s) => ({
        ui: { ...s.ui, dirty: false, filePath: filePath ?? s.ui.filePath, projectName: name ?? s.ui.projectName },
      })),

    /** Full reset — new project. */
    resetAll: () => {
      history.clear();
      set({
        doc: {
          version: 1,
          artboard: { ...DEFAULT_ARTBOARD },
          layers: [],
          meta: { name: 'Untitled Sigil', description: '', author: '', tags: [] },
        },
        selection: [],
        ui: { ...UI_DEFAULTS },
      });
    },
  };
});

/**
 * Deep-clone a document for history. `structuredClone` is available in Chrome
 * 98+ (Electron 33 ships Chrome 130), with a JSON fallback for safety.
 * @param {object} doc
 */
function snapshot(doc) {
  try {
    return structuredClone(doc);
  } catch {
    return JSON.parse(JSON.stringify(doc));
  }
}
