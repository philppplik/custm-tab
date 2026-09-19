/**
 * cust*m Tab — Browser API adapter
 *
 * Load this before every other cust*m Tab script.
 *
 * WHY THIS EXISTS
 * ---------------
 * Firefox ships two extension namespaces: `browser.*`, which returns promises,
 * and `chrome.*`, which is a callback-only compatibility shim. Calling
 * `await chrome.storage.local.get(['theme'])` in Firefox therefore does not
 * wait for anything — it resolves to `undefined`, and every setting silently
 * reads back as its default.
 *
 * Chrome has no `browser` namespace at all, but since Chrome 121 every async
 * `chrome.*` method returns a promise.
 *
 * So: prefer `browser` when it exists, fall back to `chrome`. One line, no
 * dependency, correct in both engines. This is why `manifest.json` requires
 * Chrome 121 and Firefox 128.
 *
 * Attaches `CUSTM_API` (the namespace) and `CUSTM_ENV` (capability probes).
 */
(function (global) {
  'use strict';

  const api = global.browser ?? global.chrome;

  /**
   * Resolve a dotted path against the API namespace without throwing.
   * `supports('permissions.request')` is safer than optional chaining at every
   * call site, and reads better in a conditional.
   */
  function supports(path) {
    let node = api;
    for (const part of String(path).split('.')) {
      if (node === null || node === undefined) return false;
      node = node[part];
    }
    return node !== null && node !== undefined;
  }

  // `browser` is Gecko (and Safari); Chromium only ever exposes `chrome`.
  const isGecko = typeof global.browser !== 'undefined' && !!global.browser?.runtime;

  /**
   * Resolve an extension-relative path to an absolute URL.
   * Falls back to the raw path in a context with no runtime (such as a test).
   */
  function runtimeUrl(path) {
    try {
      return api.runtime.getURL(path);
    } catch {
      return path;
    }
  }

  /**
   * Open the options page. `runtime.openOptionsPage` is the supported route in
   * both engines; the tab fallback covers contexts where it is unavailable.
   */
  async function openOptions() {
    try {
      await api.runtime.openOptionsPage();
    } catch {
      try {
        await api.tabs.create({ url: runtimeUrl('options.html') });
      } catch {
        /* Nothing left to try; never let a UI click throw. */
      }
    }
  }

  global.CUSTM_API = api;
  global.CUSTM_ENV = {
    isGecko,
    supports,
    runtimeUrl,
    openOptions,

    /**
     * Chrome exposes a local favicon cache at `_favicon/`, which resolves a
     * site icon with no network request. Firefox has no equivalent, so callers
     * must have a local fallback ready.
     */
    get hasLocalFavicons() {
      return !isGecko && supports('runtime.getURL');
    },
  };
})(typeof self !== 'undefined' ? self : window);
