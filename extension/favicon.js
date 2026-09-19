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
 * WHY THE ICONS THEN STOPPED APPEARING
 * ------------------------------------
 * Replacing it with Chrome's on-device cache fixed the privacy problem and
 * introduced a visible one. Two causes, both handled below:
 *
 *   1. `_favicon/` answers *every* request with HTTP 200. When Chrome has no
 *      icon cached for a site it returns a generic placeholder rather than an
 *      error, so an <img> never fires `error`, the monogram fallback never
 *      ran, and the grid filled with identical grey glyphs. `verifyLocal`
 *      recognises that placeholder by its bytes so the fallback can happen.
 *
 *   2. The lookup passed a bare origin (`https://example.com`) while Chrome
 *      keys its favicon database on page URLs (`https://example.com/`). The
 *      trailing slash is not cosmetic here; `pageUrlFor` restores it.
 *
 * Four sources, from most private to most reliable:
 *
 *   'local'    Chrome's `_favicon/` cache — on-device, no network at all.
 *              Firefox has no equivalent, so it falls back to a monogram.
 *   'site'     The site's own `/favicon.ico`. No third party is involved, but
 *              each site learns when you open a tab. Stated plainly in the UI.
 *   'monogram' Always draw a letter tile. Zero network, works everywhere.
 *   'remote'   A third-party icon service. Opt-in, and the settings UI says
 *              exactly what is disclosed and to whom.
 *
 * Attaches `CUSTM_FAVICON`.
 */
(function (global) {
  'use strict';

  const MODES = Object.freeze(['local', 'site', 'monogram', 'remote']);
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
   * A host that cannot resolve, used to sample Chrome's placeholder icon.
   *
   * `.invalid` is reserved by RFC 2606 precisely so it can never be
   * registered, which guarantees the favicon database has nothing for it and
   * makes the sample trustworthy. The lookup is local, so nothing is sent.
   */
  const PLACEHOLDER_PROBE = 'https://custm-tab-placeholder-probe.invalid/';

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
   * The page URL to look a favicon up by.
   *
   * Chrome's favicon database is keyed by page URL, and the root document of a
   * site is `https://host/`, with the slash. `URL.origin` drops it, which is
   * why origin-only lookups missed and every tile fell back to the placeholder.
   */
  function pageUrlFor(url) {
    const origin = global.CUSTM_URL ? global.CUSTM_URL.originOf(url) : '';
    return origin ? `${origin}/` : '';
  }

  /**
   * Chrome resolves this from its own on-device favicon cache. It is a
   * `chrome-extension://` URL, so nothing leaves the browser, but it requires
   * the `favicon` permission and does not exist in Firefox.
   */
  function localIconUrl(url) {
    const pageUrl = pageUrlFor(url);
    if (!pageUrl) return '';
    try {
      const target = new URL(global.CUSTM_ENV.runtimeUrl('/_favicon/'));
      target.searchParams.set('pageUrl', pageUrl);
      target.searchParams.set('size', String(ICON_SIZE));
      return target.href;
    } catch {
      return '';
    }
  }

  /**
   * The site's own icon, fetched straight from its origin.
   *
   * No third party sees anything. The site itself does learn that a tab was
   * opened, which is a real trade and is why this is not the default.
   */
  function siteIconUrl(url) {
    const origin = global.CUSTM_URL ? global.CUSTM_URL.originOf(url) : '';
    return origin ? `${origin}/favicon.ico` : '';
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
   * @returns {object} Either `{kind:'image', src, local, fallback}` or
   *   `{kind:'monogram', letter, hue}`. An `image` result always carries a
   *   `fallback` monogram, because a remote icon can 404 and a local one can
   *   be missing from the cache. `local` marks results that need `verifyLocal`.
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
    let local = false;
    if (resolved === 'remote') {
      src = remoteIconUrl(url);
    } else if (resolved === 'site') {
      src = siteIconUrl(url);
    } else if (global.CUSTM_ENV && global.CUSTM_ENV.hasLocalFavicons) {
      src = localIconUrl(url);
      local = true;
    }

    return src ? { kind: 'image', src, local, fallback: monogram } : monogram;
  }

  /* ── Placeholder detection ───────────────────────────────────────────── */

  /**
   * The placeholder sample, fetched once per page and shared by every tile.
   *
   * Held as the promise rather than the value so that a grid of twenty
   * bookmarks rendering at once issues one probe, not twenty.
   */
  let placeholderProbe = null;

  /** Read a URL as bytes. Returns null rather than throwing. */
  async function bytesOf(src) {
    try {
      const response = await fetch(src, { cache: 'force-cache' });
      if (!response.ok) return null;
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  function sameBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /** Lazily sample what Chrome returns for a site it has never seen. */
  function placeholderBytes() {
    if (!placeholderProbe) {
      const probe = localIconUrl(PLACEHOLDER_PROBE);
      placeholderProbe = probe ? bytesOf(probe) : Promise.resolve(null);
    }
    return placeholderProbe;
  }

  /**
   * Is this local icon a real favicon, rather than Chrome's stand-in?
   *
   * Byte-for-byte comparison against the probe. A length check alone would be
   * cheaper but would occasionally discard a real icon that happened to be the
   * same size, and a wrongly blanked tile is the bug this exists to fix.
   *
   * Fails open: if the probe or the fetch is unavailable — in Firefox, in a
   * test environment, behind an unexpected error — the icon is kept. Showing a
   * possibly-generic icon beats blanking one that was fine.
   *
   * @returns {Promise<boolean>} True when the icon should be kept.
   */
  async function verifyLocal(src) {
    if (!src || typeof fetch !== 'function') return true;

    const [placeholder, actual] = await Promise.all([placeholderBytes(), bytesOf(src)]);
    if (!placeholder || !actual) return true;

    return !sameBytes(placeholder, actual);
  }

  /** Reset the cached probe. Exists so tests start from a known state. */
  function resetProbe() {
    placeholderProbe = null;
  }

  /**
   * True when the selected mode causes a third-party request, so the settings
   * UI can show the disclosure next to the control rather than in a footnote.
   */
  function disclosesToThirdParty(mode) {
    return normalizeMode(mode) === 'remote';
  }

  /** True when the selected mode contacts the bookmarked sites themselves. */
  function disclosesToSites(mode) {
    return normalizeMode(mode) === 'site';
  }

  global.CUSTM_FAVICON = {
    modes: MODES,
    defaultMode: DEFAULT_MODE,
    remoteEndpoint: REMOTE_ENDPOINT,
    placeholderProbeUrl: PLACEHOLDER_PROBE,
    hueFor,
    monogramLetter,
    normalizeMode,
    pageUrlFor,
    resolve,
    verifyLocal,
    resetProbe,
    disclosesToThirdParty,
    disclosesToSites,
  };
})(typeof self !== 'undefined' ? self : window);
