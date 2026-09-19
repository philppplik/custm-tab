/**
 * cust*m Tab — Shared storage layer
 *
 * One schema, used consistently by newtab, options, wizard and background.
 * Persists to `storage.local` (profile-scoped, which is correct for settings
 * that describe this device).
 *
 * TREAT STORAGE AS UNTRUSTED. A user can edit it directly from DevTools, a
 * synced value arrives from another machine running an older version, and an
 * imported settings file is entirely attacker-controlled. Everything is
 * therefore normalised on the way out, not merely on the way in.
 *
 * OPTIONAL SYNC: when `syncEnabled` is on, a curated subset of settings
 * mirrors to `storage.sync`. Bookmarks stay local by design, and no credential
 * is ever syncable — `storage.sync` leaves the device.
 *
 * Attaches `CUSTM_STORE`.
 */
(function (global) {
  'use strict';

  const api = global.CUSTM_API;

  /** Hard cap. A runaway import must not be able to exhaust the quota. */
  const MAX_BOOKMARKS = 60;
  const MAX_NAME_LENGTH = 64;

  const DEFAULTS = {
    // ── Mode ──
    mode: 'dashboard', // 'dashboard' | 'redirect'
    targetUrl: '', // used when mode === 'redirect'

    // ── Dashboard ──
    bookmarks: [
      { name: 'GitHub', url: 'https://github.com' },
      { name: 'Wikipedia', url: 'https://wikipedia.org' },
      { name: 'YouTube', url: 'https://youtube.com' },
    ],
    searchEngine: 'duckduckgo', // engine id from search-engines.js
    iconMode: 'local', // 'local' | 'monogram' | 'remote' — see favicon.js

    // ── Behaviour ──
    maskUrl: true, // redirect: embed in an iframe to hide the address

    // ── Appearance ──
    theme: 'auto', // 'auto' | 'light' | 'dark'

    // ── Sync ──
    syncEnabled: false,

    // ── Lifecycle ──
    onboardingDone: false,
    lastSeen: 0,
    browserLastStartup: 0,
    lastNotified: 0,
  };

  /**
   * Keys mirrored to `storage.sync` when sync is on.
   *
   * Deliberately excluded: `bookmarks` (personal to a device), lifecycle
   * counters (meaningless elsewhere), and any credential.
   */
  const SYNC_KEYS = Object.freeze([
    'mode',
    'targetUrl',
    'searchEngine',
    'iconMode',
    'maskUrl',
    'theme',
    'syncEnabled',
  ]);

  const KEYS = Object.freeze(Object.keys(DEFAULTS));

  /** A fresh, deeply-independent copy of the defaults. */
  function getDefaults() {
    return structuredClone(DEFAULTS);
  }

  /**
   * Normalise the bookmark list.
   *
   * Anything that is not a usable `{name, url}` pair on a safe protocol is
   * dropped rather than repaired — a half-valid bookmark that silently points
   * somewhere else is worse than a missing one.
   */
  function normalizeBookmarks(value) {
    if (!Array.isArray(value)) return getDefaults().bookmarks;

    const out = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;

      const check = global.CUSTM_URL
        ? global.CUSTM_URL.normalizeBookmarkUrl(entry.url)
        : { ok: typeof entry.url === 'string', url: entry.url };
      if (!check.ok) continue;

      const name = String(entry.name == null ? '' : entry.name)
        .trim()
        .slice(0, MAX_NAME_LENGTH);

      out.push({
        name: name || (global.CUSTM_URL ? global.CUSTM_URL.displayHost(check.url) : ''),
        url: check.url,
      });
      if (out.length >= MAX_BOOKMARKS) break;
    }
    return out;
  }

  /** Clamp a value to a known set, falling back to the schema default. */
  function oneOf(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  /** Apply every field-level guarantee the rest of the app relies on. */
  function normalize(settings) {
    settings.mode = oneOf(settings.mode, ['dashboard', 'redirect'], 'dashboard');
    settings.theme = oneOf(settings.theme, ['auto', 'light', 'dark'], 'auto');
    settings.iconMode = oneOf(
      settings.iconMode,
      ['local', 'monogram', 'remote'],
      'local'
    );
    settings.bookmarks = normalizeBookmarks(settings.bookmarks);
    settings.maskUrl = settings.maskUrl !== false;
    settings.syncEnabled = settings.syncEnabled === true;
    settings.targetUrl = typeof settings.targetUrl === 'string' ? settings.targetUrl : '';
    return settings;
  }

  /** Merge stored values onto defaults, then normalise. */
  async function getAll() {
    let stored = {};
    try {
      stored = (await api.storage.local.get(KEYS)) || {};
    } catch (e) {
      // A failed read must still yield a usable UI.
      console.warn('cust*m Tab: storage read failed', e);
    }
    return normalize(Object.assign(getDefaults(), stored));
  }

  /**
   * Persist a patch, mirroring the syncable subset when sync is enabled.
   * Local storage stays authoritative if sync fails.
   */
  async function set(patch) {
    await api.storage.local.set(patch);

    let syncEnabled = false;
    try {
      const read = await api.storage.local.get(['syncEnabled']);
      syncEnabled = !!(read && read.syncEnabled);
    } catch {
      return;
    }
    if (!syncEnabled) return;

    const syncable = {};
    for (const key of SYNC_KEYS) {
      if (key in patch) syncable[key] = patch[key];
    }
    if (!Object.keys(syncable).length) return;

    try {
      await api.storage.sync.set(syncable);
    } catch (e) {
      // sync can throw on quota or when the user disabled it. Fail soft.
      console.warn('cust*m Tab: sync.set failed', e);
    }
  }

  /** Pull synced settings into local at boot, when sync is enabled. */
  async function pullSyncIfEnabled() {
    let syncEnabled = false;
    try {
      const read = await api.storage.local.get(['syncEnabled']);
      syncEnabled = !!(read && read.syncEnabled);
    } catch {
      return;
    }
    if (!syncEnabled) return;

    try {
      const synced = await api.storage.sync.get(SYNC_KEYS);
      if (synced && Object.keys(synced).length) {
        await api.storage.local.set(synced);
      }
    } catch (e) {
      console.warn('cust*m Tab: sync.get failed', e);
    }
  }

  /** Bookmarks, already normalised. */
  async function getBookmarks() {
    return (await getAll()).bookmarks;
  }

  global.CUSTM_STORE = {
    defaults: Object.freeze(DEFAULTS),
    keys: KEYS,
    syncKeys: SYNC_KEYS,
    maxBookmarks: MAX_BOOKMARKS,
    getDefaults,
    normalize,
    normalizeBookmarks,
    getAll,
    set,
    pullSyncIfEnabled,
    getBookmarks,
  };
})(typeof self !== 'undefined' ? self : window);
