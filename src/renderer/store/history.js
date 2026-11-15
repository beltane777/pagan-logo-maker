/**
 * @file src/renderer/store/history.js
 * @description A bounded undo/redo ring for document snapshots.
 *
 * Contract
 * ────────
 * ```
 *   history.push(previousDoc)   // before mutating: this doc is the undo target
 *   … mutate …
 *   history.commit(nextDoc)     // after mutating: this doc is now "present"
 * ```
 * `commit` is what makes `undo` symmetric: without it the ring cannot tell
 * which snapshot is current, so redo would send the editor back to a stale
 * document. Both calls are O(size of the document) with no diffing.
 *
 * Design notes
 * ────────────
 *   • Snapshots are full document clones. A logo document is a few dozen small
 *     JSON objects, so this is simpler and far more reliable than patches.
 *   • The ring is capped at `limit` entries; the oldest are discarded first.
 *   • Identical consecutive snapshots are collapsed, so dragging a slider does
 *     not fill the stack with no-ops.
 *
 * The module is UI-agnostic and unit-testable on its own.
 */

/**
 * Cheap structural key for equality checks.
 * @param {object} value
 * @returns {string}
 */
const key = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    // Circular or otherwise unserialisable — never compare equal.
    return `!${Math.random()}`;
  }
};

/**
 * @param {{limit?: number}} [options]
 */
export function createSnapshotRing({ limit = 80 } = {}) {
  /** @type {Array<{data: object, key: string}>} */
  let past = [];
  /** @type {Array<{data: object, key: string}>} */
  let future = [];
  /** Key of the document currently on screen. */
  let currentKey = null;

  return {
    /**
     * Record the document as it was *before* a mutation.
     * @param {object} previousDoc
     */
    push(previousDoc) {
      const k = key(previousDoc);
      if (k === currentKey) return; // the mutation changed nothing
      if (past.length && past[past.length - 1].key === k) return; // already queued
      past.push({ data: previousDoc, key: k });
      if (past.length > limit) past = past.slice(past.length - limit);
      future = [];
    },

    /**
     * Declare the document as it is *now*. Called after every mutation (and
     * after loading a file or replaying a template).
     * @param {object} doc
     */
    commit(doc) {
      currentKey = key(doc);
    },

    /**
     * Step backwards. The present document is pushed onto the redo stack.
     * @param {object} present
     * @returns {object|null} the previous document, or null at the start
     */
    undo(present) {
      const entry = past.pop();
      if (!entry) return null;
      future.push({ data: present, key: key(present) });
      currentKey = entry.key;
      return entry.data;
    },

    /**
     * Step forwards.
     * @param {object} present
     * @returns {object|null}
     */
    redo(present) {
      const entry = future.pop();
      if (!entry) return null;
      past.push({ data: present, key: key(present) });
      currentKey = entry.key;
      return entry.data;
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    /** Forget everything (new project / opened file). */
    clear() {
      past = [];
      future = [];
      currentKey = null;
    },

    /** Diagnostic counts, surfaced by the status bar in development. */
    stats: () => ({ undo: past.length, redo: future.length, limit }),
  };
}
