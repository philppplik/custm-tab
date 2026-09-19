/**
 * cust*m Tab — Bookmark icon resolution
 *
 * WHY THIS EXISTS
 * ---------------
 * The dashboard used to build every tile icon like this:
 *
 *     https://www.google.com/s2/favicons?domain=<host>&sz=64
 *
 * That is a request to Google for every bookmark, on every new tab. It hands
 * Google a list of the sites a user has pinned and a heartbeat of how often
 * they open a tab — from an extension whose README promises "no telemetry, no
 * tracking, no accounts". The feature was a tracker wearing an icon.
 *
 * Three modes, with the private one as the default:
 *
 *   'local'    Chrome's `_favicon/` cache — resolved on-device, no network.
 *              Firefox has no equivalent, so it falls back to a monogram.
 *   'monogram' Always draw a letter tile. Zero network, works everywhere.
 *   'remote'   Fetch from a third-party icon service. Opt-in only, and the
 *              settings UI states plainly what it discloses and to whom.
 *
 * Attaches `CUSTM_FAVICON`.
 */
(function (global) {
  'use strict';

  const MODES = Object.freeze(['local', 'monogram', 'remote']);
  const DEFAULT_MODE = 'local';

  /** Rendered size of a tile icon, in CSS pixels. */
  const ICON_SIZE = 64;

  /**
   * Remote provider, used only when the user opts in.
   *
   * DuckDuckGo rather than Google: it is the project's default search engine,
   * it states it does not profile users, and it needs only the hostname.
   */
  const REMOTE_ENDPOINT = 'https://icons.duckduckgo.com/ip3/';

  /**
   * Stable hue for a seed string, via FNV-1a.
   *
   * Deterministic on purpose: a site keeps the same colour across reloads,
   * devices and profiles, so tiles stay recognisable at a glance without
   * anything being stored.
   */
  function hueFor(seed) {
    let hash = 0x811c9dc5;
    const value = String(seed || '');
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return Math.abs(hash) % 360;
  }

  /**
   * The character to draw on a monogram tile.
   *
   * Prefers the first letter or digit of the user's own label, because that is
   * what they think of the site as. Falls back to the hostname, then to a dot
   * so a tile is never blank.
   */
  function monogramLetter(name, url) {
    const host = global.CUSTM_URL ? global.CUSTM_URL.displayHost(url) : '';
    const source = String(name || '').trim() || host || '';
    // Match a letter or digit in any script, so non-Latin labels work.
    const match = source.match(/[\p{L}\p{N}]/u);
    return match ? match[0].toUpperCase() : '•';
  }

  /** Normalise an arbitrary stored value to a supported mode. */
  function normalizeMode(mode) {
    return MODES.includes(mode) ? mode : DEFAULT_MODE;
  }

  /**
   * Chrome resolves this from its own on-device favicon cache. It is a
   * `chrome-extension://` URL, so nothing leaves the browser, but it requires
   * the `favicon` permission and does not exist in Firefox.
   */
  function localIconUrl(url) {
    const origin = global.CUSTM_URL ? global.CUSTM_URL.originOf(url) : '';
    if (!origin) return '';
    try {
      const target = new URL(global.CUSTM_ENV.runtimeUrl('/_favicon/'));
      target.searchParams.set('pageUrl', origin);
      target.searchParams.set('size', String(ICON_SIZE));
      return target.href;
    } catch {
      return '';
    }
  }

  /** Third-party lookup. Only ever reached when the user selected 'remote'. */
  function remoteIconUrl(url) {
    const host = global.CUSTM_URL ? global.CUSTM_URL.hostnameOf(url) : '';
    // Only the hostname is disclosed — never the path, query or fragment.
    return host ? `${REMOTE_ENDPOINT}${encodeURIComponent(host)}.ico` : '';
  }

  /**
   * Resolve the icon for a bookmark.
   *
   * @param {{name?: string, url?: string}} bookmark
   * @param {string} [mode] One of MODES.
   * @returns {object} Either `{kind:'image', src, fallback}` or
   *   `{kind:'monogram', letter, hue}`. An `image` result always carries a
   *   `fallback` monogram, because a remote icon can 404 and a local one can
   *   be missing from the cache.
   */
  function resolve(bookmark, mode) {
    const source = bookmark || {};
    const name = source.name || '';
    const url = source.url || '';
    const host = global.CUSTM_URL ? global.CUSTM_URL.displayHost(url) : '';

    const monogram = {
      kind: 'monogram',
      letter: monogramLetter(name, url),
      hue: hueFor(host || name),
    };

    const resolved = normalizeMode(mode);
    if (resolved === 'monogram') return monogram;

    // An unsafe or unparseable URL never becomes a network request.
    if (!global.CUSTM_URL || !global.CUSTM_URL.isNavigable(url)) return monogram;

    let src = '';
    if (resolved === 'remote') {
      src = remoteIconUrl(url);
    } else if (global.CUSTM_ENV && global.CUSTM_ENV.hasLocalFavicons) {
      src = localIconUrl(url);
    }

    return src ? { kind: 'image', src, fallback: monogram } : monogram;
  }

  /**
   * True when the selected mode causes a third-party request, so the settings
   * UI can show the disclosure next to the control rather than in a footnote.
   */
  function disclosesToThirdParty(mode) {
    return normalizeMode(mode) === 'remote';
  }

  global.CUSTM_FAVICON = {
    modes: MODES,
    defaultMode: DEFAULT_MODE,
    remoteEndpoint: REMOTE_ENDPOINT,
    hueFor,
    monogramLetter,
    normalizeMode,
    resolve,
    disclosesToThirdParty,
  };
})(typeof self !== 'undefined' ? self : window);
