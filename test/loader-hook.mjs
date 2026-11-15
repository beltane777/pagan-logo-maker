/**
 * @file test/loader-hook.mjs
 * @description Node module-resolution hook.
 *
 * Source modules import each other without file extensions (`./engine`), which
 * Vite resolves but Node does not. This hook retries with the usual suspects so
 * the *unbundled* source can be imported directly by the engine tests.
 */

const EXTENSIONS = ['.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];

/**
 * @param {string} specifier
 * @param {object} context
 * @param {Function} next
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith('.') || specifier.startsWith('/');
    if (!relative) throw error;
    for (const ext of EXTENSIONS) {
      try {
        return await next(specifier + ext, context);
      } catch {
        /* try the next candidate */
      }
    }
    throw error;
  }
}
