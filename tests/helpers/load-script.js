/**
 * Load an extension source file into the current test global.
 *
 * The extension ships classic scripts that attach themselves to `window`
 * (`window.CUSTM_STORE`, `window.CUSTM_ENGINES`, ...) rather than ES modules,
 * because it runs with no build step. They therefore cannot be `import`ed.
 *
 * This evaluates the real file — not a copy — so a test failure means the
 * shipped code is wrong, and a rename of the file is caught immediately.
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = join(ROOT, 'extension');

const cache = new Map();

/**
 * Evaluate `extension/<name>` in the global scope.
 *
 * @param {string} name File name relative to `extension/`, e.g. `'store.js'`.
 * @returns {typeof globalThis} The global the script attached itself to.
 */
export function loadScript(name) {
  if (!cache.has(name)) {
    cache.set(name, readFileSync(join(EXT, name), 'utf8'));
  }
  const source = cache.get(name);

  // Indirect eval runs in global scope, which is exactly what a <script> tag
  // does. The input is a repository file, never user or network data.

  (0, eval)(source);

  return globalThis;
}

/** Load several scripts in order, mirroring the <script> order of a page. */
export function loadScripts(...names) {
  for (const name of names) loadScript(name);
  return globalThis;
}

/** Read an extension file verbatim (for HTML or JSON assertions). */
export function readExtensionFile(name) {
  return readFileSync(join(EXT, name), 'utf8');
}

export { EXT as EXTENSION_DIR, ROOT as REPO_ROOT };
