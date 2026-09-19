/**
 * Load an extension source file into the current test global.
 *
 * The extension ships classic scripts that attach themselves to the global
 * (`window.CUSTM_STORE`, `self.CUSTM_ENGINES`, ...) rather than exporting ES
 * modules, because it runs with no build step. They therefore cannot be
 * imported for their exports — there are none.
 *
 * They can, however, be imported for their side effects. A file with no
 * `export` is still a valid module, and its top-level IIFE still assigns to
 * `window`. Going through `import()` rather than `eval()` matters: the module
 * graph is what Vite transforms and what the V8 coverage provider can attribute
 * lines to. Code evaluated with `eval` is invisible to coverage, which silently
 * reports 0% and fails the threshold.
 *
 * A cache-busting query gives each call a fresh evaluation, so one test cannot
 * inherit global state from another.
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = join(ROOT, 'extension');

let evaluation = 0;

/**
 * Evaluate `extension/<name>` for its side effects.
 *
 * @param {string} name File name relative to `extension/`, e.g. `'store.js'`.
 * @returns {Promise<typeof globalThis>} The global the script attached itself to.
 */
export async function loadScript(name) {
  const url = `${pathToFileURL(join(EXT, name)).href}?evaluation=${++evaluation}`;
  await import(/* @vite-ignore */ url);
  return globalThis;
}

/** Load several scripts in order, mirroring the <script> order of a page. */
export async function loadScripts(...names) {
  for (const name of names) await loadScript(name);
  return globalThis;
}

/** Read an extension file verbatim (for HTML or JSON assertions). */
export function readExtensionFile(name) {
  return readFileSync(join(EXT, name), 'utf8');
}

export { EXT as EXTENSION_DIR, ROOT as REPO_ROOT };
