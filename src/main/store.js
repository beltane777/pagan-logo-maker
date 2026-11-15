/**
 * @file src/main/store.js
 * @description Tiny, dependency-free JSON persistence layer for the main
 * process. Used for window geometry, the recent-projects list and user
 * preferences. Writes are atomic (tmp file + rename) so a crash mid-write can
 * never corrupt the settings file.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * @typedef {Object} StoreOptions
 * @property {string} name  file name without extension, e.g. `window-state`
 * @property {object} defaults  values used when the file is missing/partial
 * @property {string} dir  directory to store the file in
 */

/**
 * Create a lazily-loaded JSON store.
 * @param {StoreOptions} options
 */
function createStore({ name, defaults, dir }) {
  const file = path.join(dir, `${name}.json`);
  /** @type {object} */
  let data = { ...defaults };

  try {
    const raw = fs.readFileSync(file, 'utf8');
    data = { ...defaults, ...JSON.parse(raw) };
  } catch {
    // First run, or the file was removed — defaults are correct.
  }

  /** Flush to disk atomically. */
  const persist = () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, file);
    } catch (err) {
      console.error(`[store:${name}] failed to persist`, err);
    }
  };

  return {
    /** @returns {object} a shallow copy so callers cannot mutate internals */
    all: () => ({ ...data }),
    /** @param {string} key @param {*} fallback */
    get: (key, fallback) => (key in data ? data[key] : fallback),
    /**
     * Set one or more keys.
     * @param {string|object} key
     * @param {*} [value]
     */
    set: (key, value) => {
      if (typeof key === 'object') Object.assign(data, key);
      else data[key] = value;
      persist();
      return data;
    },
    file,
  };
}

module.exports = { createStore };
