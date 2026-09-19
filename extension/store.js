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
    iconMode: 'local', // 'local' | 'site' | 'monogram' | 'remote' — favicon.js

    // ── Behaviour ──
    maskUrl: true, // redirect: embed in an iframe to hide the address

    // ── Appearance ──
    theme: 'auto', // 'auto' | 'light' | 'dark'

    // Surface material and the typography of the clock and greeting.
    // See appearance.js — this is the "your tab, your rules" surface area.
    appearance: {
      surface: 'glass', // 'glass' | 'frosted' | 'solid'
      solidTone: 'dark', // 'dark' | 'light', used when surface is 'solid'
      clock: {
        show: true,
        seconds: false,
        format: 'auto', // 'auto' | '12' | '24'
        size: 1, // multiplier on the stylesheet's base size
        weight: 200, // 100-800
        font: 'system', // 'system' | 'rounded' | 'serif' | 'mono'
      },
      date: { show: true },
      greeting: {
        mode: 'time', // 'time' | 'text' | 'none'
        name: '', // appended to the time-of-day greeting
        text: 'cust*m Tab', // used when mode is 'text'
      },
    },

    // Background: gradient palette, flat colour, a Pexels photo, or the
    // user's own picture. See backgrounds.js for the shape and contrast rules.
    background: {
      type: 'gradient', // 'gradient' | 'color' | 'photo' | 'image'
      gradient: 'aurora',
      color: '#180646',
      overlay: 0.35, // scrim over a picture, 0-0.8
      blur: 0, // picture blur in px, 0-24
    },

    // The user's own background picture, as a data URL. Device-local: it is
    // far too large for the 100KB storage.sync quota, and it is a file from
    // their disk, which is not something to copy to another machine silently.
    backgroundImage: '',

    // Sunrise reveal on page load. Decorative, and suppressed automatically
    // under prefers-reduced-motion.
    sunrise: true,

    // ── Pexels photo backgrounds ──
    pexels: {
      query: '', // empty means the curated feed
      orientation: 'landscape',
      refresh: 'daily', // 'tab' | 'hourly' | 'daily'
    },

    // The user's own API key. NEVER syncable: storage.sync leaves the device,
    // and this is a credential. Redacted from settings exports.
    pexelsApiKey: '',

    // A cached page of photos, rotated locally so one request serves a day.
    pexelsCache: null,

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
    'appearance',
    'background',
    'sunrise',
    'pexels',
    'syncEnabled',
  ]);

  /**
   * Keys that must never leave this device, even though they are settings.
   *
   * `pexelsApiKey` is a credential. `pexelsCache` and `backgroundImage` are
   * large, device-local blobs that would burn the 100KB storage.sync quota —
   * a single background picture exceeds the entire quota on its own.
   */
  const NEVER_SYNC_KEYS = Object.freeze([
    'pexelsApiKey',
    'pexelsCache',
    'backgroundImage',
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
    settings.iconMode = global.CUSTM_FAVICON
      ? global.CUSTM_FAVICON.normalizeMode(settings.iconMode)
      : 'local';
    settings.bookmarks = normalizeBookmarks(settings.bookmarks);
    settings.maskUrl = settings.maskUrl !== false;
    settings.sunrise = settings.sunrise !== false;
    settings.syncEnabled = settings.syncEnabled === true;
    settings.targetUrl = typeof settings.targetUrl === 'string' ? settings.targetUrl : '';

    settings.appearance = global.CUSTM_APPEARANCE
      ? global.CUSTM_APPEARANCE.normalize(settings.appearance)
      : settings.appearance;

    settings.background = global.CUSTM_BACKGROUND
      ? global.CUSTM_BACKGROUND.normalize(settings.background)
      : settings.background;

    // Anything that is not one of the three raster data URLs this app writes
    // is discarded outright. It would otherwise be interpolated into a CSS
    // url() on a privileged extension origin.
    settings.backgroundImage =
      global.CUSTM_BACKGROUND &&
      global.CUSTM_BACKGROUND.isImageData(settings.backgroundImage)
        ? settings.backgroundImage
        : '';

    const pexels =
      settings.pexels && typeof settings.pexels === 'object' ? settings.pexels : {};
    settings.pexels = {
      query: String(pexels.query == null ? '' : pexels.query).slice(0, 80),
      orientation: oneOf(
        pexels.orientation,
        ['landscape', 'portrait', 'square'],
        'landscape'
      ),
      refresh: oneOf(pexels.refresh, ['tab', 'hourly', 'daily'], 'daily'),
    };
    settings.pexelsApiKey =
      typeof settings.pexelsApiKey === 'string' ? settings.pexelsApiKey.trim() : '';

    return settings;
  }

  /**
   * A copy of the settings safe to write to a file or paste into an issue.
   * The API key is a credential and the photo cache is device-local noise.
   */
  function toExport(settings) {
    const copy = structuredClone(settings);
    for (const key of NEVER_SYNC_KEYS) delete copy[key];
    return copy;
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
      // Belt and braces: SYNC_KEYS should never contain a credential, but a
      // future edit adding one there must not silently upload it.
      if (key in patch && !NEVER_SYNC_KEYS.includes(key)) syncable[key] = patch[key];
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
    neverSyncKeys: NEVER_SYNC_KEYS,
    maxBookmarks: MAX_BOOKMARKS,
    getDefaults,
    normalize,
    normalizeBookmarks,
    toExport,
    getAll,
    set,
    pullSyncIfEnabled,
    getBookmarks,
  };
})(typeof self !== 'undefined' ? self : window);
