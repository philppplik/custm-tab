import { describe, test, expect, beforeEach, vi } from 'vitest';
import { loadScripts } from './helpers/load-script.js';

const KEY = 'a'.repeat(56);

/** A minimal Pexels photo, shaped like the real API response. */
const rawPhoto = (id) => ({
  id,
  url: `https://www.pexels.com/photo/${id}/`,
  photographer: 'Ada Lovelace',
  photographer_url: 'https://www.pexels.com/@ada',
  avg_color: '#334455',
  alt: 'A mountain',
  src: {
    landscape: `https://images.pexels.com/photos/${id}/landscape.jpg`,
    large2x: `https://images.pexels.com/photos/${id}/large2x.jpg`,
    original: `https://images.pexels.com/photos/${id}/original.jpg`,
  },
});

/** Stub `fetch` with a single canned response. */
function stubFetch(options) {
  const { status = 200, body = {}, headers = {} } = options || {};
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name) => (name in headers ? headers[name] : null) },
  });
  globalThis.fetch = spy;
  return spy;
}

describe('CUSTM_PEXELS', () => {
  let pexels;

  beforeEach(async () => {
    await loadScripts('compat.js', 'url.js', 'pexels.js');
    pexels = globalThis.CUSTM_PEXELS;
  });

  describe('looksLikeKey', () => {
    test('accepts a realistic key', () => {
      expect(pexels.looksLikeKey(KEY)).toBe(true);
      expect(pexels.looksLikeKey(`  ${KEY}  `)).toBe(true);
    });

    test('rejects obvious non-keys without spending a request', () => {
      const bad = ['', 'short', null, undefined, 'has spaces in it', 'a'.repeat(200)];
      for (const value of bad) {
        expect(pexels.looksLikeKey(value), String(value)).toBe(false);
      }
    });
  });

  describe('fetchPage', () => {
    test('sends the key in the Authorization header with no Bearer prefix', async () => {
      const spy = stubFetch({ body: { photos: [rawPhoto(1)] } });
      await pexels.fetchPage({ key: KEY, query: 'mountains' });

      const init = spy.mock.calls[0][1];
      expect(init.headers.Authorization).toBe(KEY);
      expect(init.headers.Authorization).not.toMatch(/bearer/i);
    });

    /** A key in a query string ends up in logs, history and referrers. */
    test('never puts the key in the URL', async () => {
      const spy = stubFetch({ body: { photos: [rawPhoto(1)] } });
      await pexels.fetchPage({ key: KEY, query: 'mountains' });

      expect(spy.mock.calls[0][0]).not.toContain(KEY);
    });

    test('refuses to follow a redirect, so the key cannot leak cross-origin', async () => {
      const spy = stubFetch({ body: { photos: [rawPhoto(1)] } });
      await pexels.fetchPage({ key: KEY, query: 'x' });
      expect(spy.mock.calls[0][1].redirect).toBe('error');
    });

    test('uses the search endpoint with a query', async () => {
      const spy = stubFetch({ body: { photos: [rawPhoto(1)] } });
      await pexels.fetchPage({ key: KEY, query: 'ocean', orientation: 'portrait' });

      const url = new URL(spy.mock.calls[0][0]);
      expect(url.pathname).toBe('/v1/search');
      expect(url.searchParams.get('query')).toBe('ocean');
      expect(url.searchParams.get('orientation')).toBe('portrait');
    });

    test('uses the curated endpoint when there is no query', async () => {
      const spy = stubFetch({ body: { photos: [rawPhoto(1)] } });
      await pexels.fetchPage({ key: KEY, query: '' });

      expect(new URL(spy.mock.calls[0][0]).pathname).toBe('/v1/curated');
    });

    test('ignores an unknown orientation rather than sending it', async () => {
      const spy = stubFetch({ body: { photos: [rawPhoto(1)] } });
      await pexels.fetchPage({ key: KEY, query: 'x', orientation: 'diagonal' });

      expect(new URL(spy.mock.calls[0][0]).searchParams.has('orientation')).toBe(false);
    });

    test('rejects a malformed key before touching the network', async () => {
      const spy = stubFetch();
      const result = await pexels.fetchPage({ key: 'nope' });

      expect(result).toEqual({ ok: false, reason: 'pexelsNoKey' });
      expect(spy).not.toHaveBeenCalled();
    });

    test.each([
      [401, 'pexelsBadKey'],
      [429, 'pexelsRateLimited'],
      [500, 'pexelsFailed'],
      [403, 'pexelsFailed'],
    ])('maps HTTP %i to %s', async (status, reason) => {
      stubFetch({ status });
      expect((await pexels.fetchPage({ key: KEY })).reason).toBe(reason);
    });

    test('reports a network failure distinctly', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
      expect((await pexels.fetchPage({ key: KEY })).reason).toBe('pexelsNetwork');
    });

    test('reports an empty result set', async () => {
      stubFetch({ body: { photos: [] } });
      expect((await pexels.fetchPage({ key: KEY })).reason).toBe('pexelsNoResults');
    });

    test('surfaces the remaining rate-limit budget', async () => {
      stubFetch({
        body: { photos: [rawPhoto(1)] },
        headers: { 'X-Ratelimit-Remaining': '17482' },
      });
      expect((await pexels.fetchPage({ key: KEY })).remaining).toBe(17482);
    });

    test('tolerates the rate-limit header being absent', async () => {
      stubFetch({ body: { photos: [rawPhoto(1)] } });
      expect((await pexels.fetchPage({ key: KEY })).remaining).toBeNull();
    });
  });

  describe('toPhoto', () => {
    test('keeps only the fields that are rendered', () => {
      const photo = pexels.toPhoto(rawPhoto(42));
      expect(photo).toMatchObject({
        id: 42,
        photographer: 'Ada Lovelace',
        photographerUrl: 'https://www.pexels.com/@ada',
        avgColor: '#334455',
      });
      expect(photo.src).toContain('landscape.jpg');
    });

    test('returns null for a malformed entry rather than a half-photo', () => {
      expect(pexels.toPhoto(null)).toBeNull();
      expect(pexels.toPhoto({})).toBeNull();
    });

    test('supplies an average colour when the API omits one', () => {
      const raw = rawPhoto(1);
      delete raw.avg_color;
      expect(pexels.toPhoto(raw).avgColor).toBeTruthy();
    });
  });

  describe('cache freshness', () => {
    const cache = (fetchedAt, count = 3) => ({
      photos: Array.from({ length: count }, (_, i) => ({ id: i })),
      fetchedAt,
      query: '',
      orientation: '',
      index: 0,
    });

    test('an empty cache is always stale', () => {
      expect(pexels.isStale(null, 'daily')).toBe(true);
      expect(pexels.isStale({ photos: [] }, 'daily')).toBe(true);
    });

    test('respects each refresh interval', () => {
      const now = 10000000000;
      const hour = 60 * 60 * 1000;
      expect(pexels.isStale(cache(now - hour / 2), 'hourly', now)).toBe(false);
      expect(pexels.isStale(cache(now - hour * 2), 'hourly', now)).toBe(true);
      expect(pexels.isStale(cache(now - hour * 12), 'daily', now)).toBe(false);
      expect(pexels.isStale(cache(now - hour * 30), 'daily', now)).toBe(true);
    });

    test('an unknown refresh setting falls back to daily', () => {
      const now = 10000000000;
      const hour = 60 * 60 * 1000;
      expect(pexels.isStale(cache(now - hour * 2), 'whenever', now)).toBe(false);
    });

    test('a cache fetched for different settings does not match', () => {
      const entry = { photos: [{}], query: 'ocean', orientation: 'landscape' };
      expect(
        pexels.matchesSettings(entry, { query: 'ocean', orientation: 'landscape' })
      ).toBe(true);
      expect(
        pexels.matchesSettings(entry, { query: 'forest', orientation: 'landscape' })
      ).toBe(false);
      expect(
        pexels.matchesSettings(entry, { query: 'ocean', orientation: 'portrait' })
      ).toBe(false);
      expect(pexels.matchesSettings(null, { query: '', orientation: '' })).toBe(false);
    });

    test('tab refresh advances the index and wraps', () => {
      const entry = cache(0, 3);
      expect(pexels.pickIndex({ ...entry, index: 0 }, 'tab')).toBe(1);
      expect(pexels.pickIndex({ ...entry, index: 2 }, 'tab')).toBe(0);
    });

    test('non-tab refresh is stable within the period', () => {
      const entry = cache(1700000000000, 5);
      expect(pexels.pickIndex(entry, 'daily')).toBe(pexels.pickIndex(entry, 'daily'));
    });
  });

  describe('resolve', () => {
    const freshCache = {
      photos: [
        { id: 1, src: 'a' },
        { id: 2, src: 'b' },
      ],
      fetchedAt: Date.now(),
      query: '',
      orientation: 'landscape',
      index: 0,
    };

    /** The whole rate-limit strategy: a fresh cache must not hit the network. */
    test('serves from cache without a request', async () => {
      const spy = stubFetch();
      const result = await pexels.resolve({
        key: KEY,
        query: '',
        orientation: 'landscape',
        refresh: 'tab',
        cache: freshCache,
      });

      expect(spy).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.fetched).toBe(false);
      // Rotated, not repeated.
      expect(result.cache.index).toBe(1);
    });

    test('fetches when the cache is stale', async () => {
      const spy = stubFetch({ body: { photos: [rawPhoto(9)] } });
      const result = await pexels.resolve({
        key: KEY,
        query: '',
        orientation: 'landscape',
        refresh: 'daily',
        cache: { ...freshCache, fetchedAt: 0 },
      });

      expect(spy).toHaveBeenCalledOnce();
      expect(result.fetched).toBe(true);
      expect(result.cache.photos).toHaveLength(1);
    });

    test('fetches when the search settings changed', async () => {
      const spy = stubFetch({ body: { photos: [rawPhoto(9)] } });
      await pexels.resolve({
        key: KEY,
        query: 'forest',
        orientation: 'landscape',
        refresh: 'daily',
        cache: freshCache,
      });
      expect(spy).toHaveBeenCalledOnce();
    });

    /** A rate-limited refresh must not blank the tab. */
    test('keeps showing the stale photo when the refresh fails', async () => {
      stubFetch({ status: 429 });
      const result = await pexels.resolve({
        key: KEY,
        query: '',
        orientation: 'landscape',
        refresh: 'daily',
        cache: { ...freshCache, fetchedAt: 0 },
      });

      expect(result.ok).toBe(true);
      expect(result.stale).toBe(true);
      expect(result.photo).toBeTruthy();
    });

    test('reports failure when there is no cache to fall back on', async () => {
      stubFetch({ status: 401 });
      const result = await pexels.resolve({ key: KEY, refresh: 'daily', cache: null });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('pexelsBadKey');
    });
  });

  describe('verifyKey', () => {
    test('confirms a working key and reports the remaining budget', async () => {
      stubFetch({
        body: { photos: [rawPhoto(1)] },
        headers: { 'X-Ratelimit-Remaining': '42' },
      });
      expect(await pexels.verifyKey(KEY)).toEqual({ ok: true, remaining: 42 });
    });

    test('reports why a key was refused', async () => {
      stubFetch({ status: 401 });
      expect(await pexels.verifyKey(KEY)).toEqual({ ok: false, reason: 'pexelsBadKey' });
    });
  });

  describe('host permission', () => {
    test('is scoped to the Pexels API host only', () => {
      expect(pexels.hostPermission).toBe('https://api.pexels.com/*');
    });

    test('requests permission through the permissions API', async () => {
      chrome.permissions.request.mockResolvedValueOnce(true);
      expect(await pexels.requestPermission()).toBe(true);
      expect(chrome.permissions.request).toHaveBeenCalledWith({
        origins: ['https://api.pexels.com/*'],
      });
    });

    test('a declined prompt is reported, not thrown', async () => {
      chrome.permissions.request.mockRejectedValueOnce(new Error('denied'));
      expect(await pexels.requestPermission()).toBe(false);
    });

    test('drops the permission again when photos are turned off', async () => {
      chrome.permissions.remove.mockResolvedValueOnce(true);
      expect(await pexels.dropPermission()).toBe(true);
    });
  });
});
