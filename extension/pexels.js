/**
 * cust*m Tab — Pexels photo backgrounds
 *
 * THE KEY IS THE USER'S, NOT OURS
 * -------------------------------
 * Anything bundled into an extension is public: the package is a ZIP anyone
 * can open. A shipped API key would be scraped within days, every install
 * would share one 200-requests-per-hour budget, and Pexels would revoke it.
 *
 * So the user brings their own key. It lives in `storage.local` on this
 * device, is never mirrored to `storage.sync`, and is redacted from settings
 * exports. It travels to exactly one place: the `Authorization` header of a
 * request to api.pexels.com that the user's own configuration triggered.
 *
 * RESPECTING THE RATE LIMIT
 * -------------------------
 * Fetching a photo per new tab would exhaust 200 requests/hour in an afternoon
 * and, per the Pexels terms, is the kind of use that gets access terminated.
 * Instead one request fetches a *page* of photos, which is cached and rotated
 * locally. A user on "every tab" still gets a different photo each time while
 * the network is touched roughly twice a day.
 *
 * Attaches `CUSTM_PEXELS`.
 */
(function (global) {
  'use strict';

  const api = global.CUSTM_API;

  const API_ORIGIN = 'https://api.pexels.com';
  const HOST_PERMISSION = 'https://api.pexels.com/*';
  const SEARCH_ENDPOINT = `${API_ORIGIN}/v1/search`;
  const CURATED_ENDPOINT = `${API_ORIGIN}/v1/curated`;

  /** One request returns this many photos, which are then rotated locally. */
  const PAGE_SIZE = 24;

  /** How long a cached page stays fresh, per refresh setting. */
  const REFRESH_INTERVALS = Object.freeze({
    tab: 6 * 60 * 60 * 1000, // rotate per tab, refetch a few times a day
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
  });

  const ORIENTATIONS = Object.freeze(['landscape', 'portrait', 'square']);

  /** A Pexels key is a long alphanumeric string. */
  const KEY_SHAPE = /^[A-Za-z0-9]{40,80}$/;

  /** Reject a malformed key before spending a request on it. */
  function looksLikeKey(key) {
    return KEY_SHAPE.test(String(key || '').trim());
  }

  /** True when the user has granted access to the Pexels API host. */
  async function hasPermission() {
    if (!global.CUSTM_ENV.supports('permissions.contains')) return true;
    try {
      return await api.permissions.contains({ origins: [HOST_PERMISSION] });
    } catch {
      return false;
    }
  }

  /**
   * Ask for host access. Must be called from a user gesture — browsers reject
   * a permission prompt that did not originate from a click.
   */
  async function requestPermission() {
    if (!global.CUSTM_ENV.supports('permissions.request')) return true;
    try {
      return await api.permissions.request({ origins: [HOST_PERMISSION] });
    } catch {
      return false;
    }
  }

  /** Drop host access again when the user turns photo backgrounds off. */
  async function dropPermission() {
    if (!global.CUSTM_ENV.supports('permissions.remove')) return true;
    try {
      return await api.permissions.remove({ origins: [HOST_PERMISSION] });
    } catch {
      return false;
    }
  }

  /**
   * Reduce a Pexels photo to the fields actually rendered.
   *
   * Storing the raw response would put a large, mostly unused object into
   * `storage.local` for every cached photo.
   */
  function toPhoto(raw) {
    if (!raw || !raw.src) return null;
    return {
      id: raw.id,
      // Page URL, used for the attribution link Pexels asks for.
      url: raw.url,
      // `landscape` is ~1200px wide: sharp enough full-screen, small enough
      // that a new tab is not waiting on a multi-megabyte original.
      src: raw.src.landscape || raw.src.large2x || raw.src.large || raw.src.original,
      srcLarge: raw.src.large2x || raw.src.original,
      photographer: raw.photographer,
      photographerUrl: raw.photographer_url,
      // Pexels supplies `avg_color`, which lets the page paint a matching
      // backdrop instantly while the photo is still downloading.
      avgColor: raw.avg_color || '#1b132b',
      alt: raw.alt || '',
    };
  }

  /**
   * Perform one API call.
   *
   * @returns {object} `{ok: true, photos, remaining}` or `{ok: false, reason}`.
   */
  async function fetchPage(options) {
    const { key, query, orientation } = options || {};
    if (!looksLikeKey(key)) return { ok: false, reason: 'pexelsNoKey' };

    const useSearch = Boolean(String(query || '').trim());
    const endpoint = new URL(useSearch ? SEARCH_ENDPOINT : CURATED_ENDPOINT);
    endpoint.searchParams.set('per_page', String(PAGE_SIZE));
    if (useSearch) {
      endpoint.searchParams.set('query', String(query).trim());
      if (ORIENTATIONS.includes(orientation)) {
        endpoint.searchParams.set('orientation', orientation);
      }
    }

    let response;
    try {
      response = await fetch(endpoint.href, {
        // Pexels uses the raw key, with no "Bearer" prefix.
        headers: { Authorization: String(key).trim() },
        // The key must not ride along on a redirect to another origin.
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      return { ok: false, reason: 'pexelsNetwork' };
    }

    if (response.status === 401) {
      return { ok: false, reason: 'pexelsBadKey', status: 401 };
    }
    if (response.status === 429) {
      return { ok: false, reason: 'pexelsRateLimited', status: 429 };
    }
    if (!response.ok) {
      return { ok: false, reason: 'pexelsFailed', status: response.status };
    }

    let body;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: 'pexelsFailed' };
    }

    const photos = (body.photos || []).map(toPhoto).filter(Boolean);
    if (!photos.length) return { ok: false, reason: 'pexelsNoResults' };

    // Only present on 2xx responses, per the Pexels docs.
    const remainingHeader = response.headers.get('X-Ratelimit-Remaining');
    const remaining = remainingHeader === null ? null : Number(remainingHeader);

    return { ok: true, photos, remaining };
  }

  /** True when a cached page is too old for the chosen refresh setting. */
  function isStale(cache, refresh, now) {
    const at = typeof now === 'number' ? now : Date.now();
    if (!cache || !Array.isArray(cache.photos) || !cache.photos.length) return true;
    const maxAge = REFRESH_INTERVALS[refresh] || REFRESH_INTERVALS.daily;
    return at - (cache.fetchedAt || 0) > maxAge;
  }

  /** True when the cached page was fetched for the same search settings. */
  function matchesSettings(cache, options) {
    const { query, orientation } = options || {};
    if (!cache) return false;
    return (
      (cache.query || '') === String(query || '').trim() &&
      (cache.orientation || '') === (orientation || '')
    );
  }

  /**
   * Pick which photo from the cached page to show.
   *
   * `tab` advances on every new tab; the other settings hold one photo for the
   * whole period, so tabs opened together look consistent rather than
   * flickering between images.
   */
  function pickIndex(cache, refresh) {
    const count = cache.photos.length;
    if (!count) return 0;
    if (refresh === 'tab') return ((cache.index || 0) + 1) % count;
    const period = REFRESH_INTERVALS[refresh] || REFRESH_INTERVALS.daily;
    return Math.floor((cache.fetchedAt || 0) / period) % count;
  }

  /**
   * Resolve the photo to display, fetching only when the cache is stale.
   *
   * @returns {object} `{ok: true, photo, cache, fetched}` or `{ok: false, reason}`.
   */
  async function resolve(options) {
    const { key, query, orientation, refresh, cache } = options || {};
    const fresh =
      !isStale(cache, refresh) && matchesSettings(cache, { query, orientation });

    if (fresh) {
      const index = pickIndex(cache, refresh);
      return {
        ok: true,
        photo: cache.photos[index],
        cache: Object.assign({}, cache, { index }),
        fetched: false,
      };
    }

    const page = await fetchPage({ key, query, orientation });
    if (!page.ok) {
      // A failed refresh must not blank the tab: keep showing the stale photo.
      if (cache && Array.isArray(cache.photos) && cache.photos.length) {
        const index = pickIndex(cache, refresh);
        return {
          ok: true,
          photo: cache.photos[index],
          cache,
          fetched: false,
          stale: true,
        };
      }
      return { ok: false, reason: page.reason, cache };
    }

    const next = {
      photos: page.photos,
      fetchedAt: Date.now(),
      query: String(query || '').trim(),
      orientation: orientation || '',
      index: 0,
      remaining: page.remaining,
    };
    return { ok: true, photo: next.photos[0], cache: next, fetched: true };
  }

  /**
   * Verify a key by spending one request on it.
   * Backs the "Test key" button, so the user finds out immediately.
   */
  async function verifyKey(key) {
    const page = await fetchPage({ key, query: '', orientation: '' });
    if (page.ok) return { ok: true, remaining: page.remaining };
    return { ok: false, reason: page.reason };
  }

  global.CUSTM_PEXELS = {
    hostPermission: HOST_PERMISSION,
    orientations: ORIENTATIONS,
    refreshIntervals: REFRESH_INTERVALS,
    pageSize: PAGE_SIZE,
    looksLikeKey,
    hasPermission,
    requestPermission,
    dropPermission,
    toPhoto,
    fetchPage,
    isStale,
    matchesSettings,
    pickIndex,
    resolve,
    verifyKey,
  };
})(typeof self !== 'undefined' ? self : window);
