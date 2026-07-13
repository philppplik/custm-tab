/**
 * cust*m Tab — Shared Storage Layer
 *
 * One schema, used consistently by newtab, options, wizard and background.
 * Persists to chrome.storage.local (profile-scoped, correct for an extension).
 *
 * OPTIONAL SYNC: when the user enables `syncEnabled`, a curated subset of
 * settings (everything EXCEPT bookmarks and lifecycle fields) is mirrored to
 * chrome.storage.sync so it follows the user's Google account across machines.
 * Bookmarks stay local — they are device/personal and not synced by design.
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

    // ── Sync ──
    syncEnabled: false, // when true, settings (minus bookmarks) mirror to storage.sync

    // ── Lifecycle ──
    onboardingDone: false,
    lastSeen: 0,
    browserLastStartup: 0,
    lastNotified: 0,
  };

  // Keys that are mirrored to chrome.storage.sync when sync is enabled.
  // Bookmarks and lifecycle telemetry are intentionally excluded.
  const SYNC_KEYS = [
    'mode',
    'targetUrl',
    'searchEngine',
    'maskUrl',
    'theme',
    'syncEnabled',
  ];

  const KEYS = Object.keys(DEFAULTS);

  function getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  /** Merge stored values onto defaults so new keys appear automatically. */
  async function getAll() {
    const stored = await chrome.storage.local.get(KEYS);
    return Object.assign(getDefaults(), stored);
  }

  /**
   * Persist a patch. If the user enabled sync AND the patch touches a
   * syncable key, mirror those keys to chrome.storage.sync too.
   */
  async function set(patch) {
    await chrome.storage.local.set(patch);
    const s = await chrome.storage.local.get(['syncEnabled']);
    if (s.syncEnabled) {
      const syncable = {};
      let any = false;
      for (const k of SYNC_KEYS) {
        if (k in patch) {
          syncable[k] = patch[k];
          any = true;
        }
      }
      if (any) {
        try {
          await chrome.storage.sync.set(syncable);
        } catch (e) {
          // storage.sync can throw (quota / disabled) — fail soft, local wins.
          console.warn('cust*m Tab: sync.set failed', e);
        }
      }
    }
  }

  /**
   * On load, if sync is enabled, pull synced settings into local so the
   * user's other devices take effect. Called once at boot (e.g. by newtab).
   */
  async function pullSyncIfEnabled() {
    const s = await chrome.storage.local.get(['syncEnabled']);
    if (!s.syncEnabled) return;
    try {
      const synced = await chrome.storage.sync.get(SYNC_KEYS);
      if (Object.keys(synced).length) {
        await chrome.storage.local.set(synced);
      }
    } catch (e) {
      console.warn('cust*m Tab: sync.get failed', e);
    }
  }

  /** Convenience: load bookmarks (fallback to defaults). */
  async function getBookmarks() {
    const s = await getAll();
    return Array.isArray(s.bookmarks) ? s.bookmarks : getDefaults().bookmarks;
  }

  window.CUSTM_STORE = {
    defaults: DEFAULTS,
    keys: KEYS,
    syncKeys: SYNC_KEYS,
    getAll,
    set,
    pullSyncIfEnabled,
    getBookmarks,
  };
})();
