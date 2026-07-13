/**
 * cust*m Tab — Shared Storage Layer
 *
 * One schema, used consistently by newtab, options, wizard and background.
 * Persists to chrome.storage.local (profile-scoped, correct for an extension).
 * Kept local (no sync) per product decision — see decision notes.
 *
 * Attaches to window.CUSTM_STORE.
 */
(function () {
  'use strict';

  const DEFAULTS = {
    // ── Mode ──
    mode: 'dashboard', // 'dashboard' | 'redirect'
    targetUrl: '', // used when mode === 'redirect'

    // ── Dashboard ──
    bookmarks: [
      { name: 'Google', url: 'https://www.google.com' },
      { name: 'YouTube', url: 'https://youtube.com' },
      { name: 'Reddit', url: 'https://reddit.com' },
    ],
    searchEngine: 'duckduckgo', // engine id from search-engines.js

    // ── Behaviour ──
    maskUrl: true, // redirect: embed in iframe (hide address bar)

    // ── Appearance ──
    theme: 'auto', // 'auto' | 'light' | 'dark'

    // ── Lifecycle ──
    onboardingDone: false,
    lastSeen: 0,
    browserLastStartup: 0,
    lastNotified: 0,
  };

  const KEYS = Object.keys(DEFAULTS);

  function getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  /** Merge stored values onto defaults so new keys appear automatically. */
  async function getAll() {
    const stored = await chrome.storage.local.get(KEYS);
    return Object.assign(getDefaults(), stored);
  }

  async function set(patch) {
    await chrome.storage.local.set(patch);
  }

  /** Convenience: load bookmarks (fallback to defaults). */
  async function getBookmarks() {
    const s = await getAll();
    return Array.isArray(s.bookmarks) ? s.bookmarks : getDefaults().bookmarks;
  }

  window.CUSTM_STORE = {
    defaults: DEFAULTS,
    keys: KEYS,
    getAll,
    set,
    getBookmarks,
  };
})();
