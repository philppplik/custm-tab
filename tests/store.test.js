import { describe, test, expect, beforeEach } from 'vitest';
import { loadScripts } from './helpers/load-script.js';

describe('CUSTM_STORE', () => {
  let store;

  beforeEach(async () => {
    // compat.js defines CUSTM_API and url.js defines CUSTM_URL; store.js
    // depends on both, exactly as the pages load them.
    await loadScripts('compat.js', 'url.js', 'store.js');
    store = globalThis.CUSTM_STORE;
  });

  describe('getAll', () => {
    test('returns the full default schema when storage is empty', async () => {
      const settings = await store.getAll();
      expect(settings.mode).toBe('dashboard');
      expect(settings.searchEngine).toBe('duckduckgo');
      expect(settings.theme).toBe('auto');
      expect(settings.syncEnabled).toBe(false);
      expect(settings.onboardingDone).toBe(false);
      expect(Array.isArray(settings.bookmarks)).toBe(true);
    });

    test('merges stored values onto defaults so new keys appear automatically', async () => {
      chrome.storage.local.__seed({ mode: 'redirect' });

      const settings = await store.getAll();
      expect(settings.mode).toBe('redirect');
      // A key the stored profile predates still resolves to its default.
      expect(settings.theme).toBe('auto');
    });

    test('returns a fresh object each call, so a caller cannot corrupt defaults', async () => {
      const first = await store.getAll();
      first.bookmarks.push({ name: 'Injected', url: 'https://evil.example' });
      first.mode = 'redirect';

      const second = await store.getAll();
      expect(second.mode).toBe('dashboard');
      expect(second.bookmarks.map((b) => b.name)).not.toContain('Injected');
    });
  });

  describe('set', () => {
    test('persists the patch to local storage', async () => {
      await store.set({ mode: 'redirect', targetUrl: 'https://example.com' });

      const settings = await store.getAll();
      expect(settings.mode).toBe('redirect');
      expect(settings.targetUrl).toBe('https://example.com');
    });

    test('leaves untouched keys alone', async () => {
      await store.set({ theme: 'dark' });
      await store.set({ mode: 'redirect' });

      const settings = await store.getAll();
      expect(settings.theme).toBe('dark');
      expect(settings.mode).toBe('redirect');
    });

    test('does not touch sync storage while sync is disabled', async () => {
      await store.set({ theme: 'dark' });
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('mirrors syncable keys to sync storage once enabled', async () => {
      chrome.storage.local.__seed({ syncEnabled: true });

      await store.set({ theme: 'dark', searchEngine: 'brave' });

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        theme: 'dark',
        searchEngine: 'brave',
      });
    });

    test('never mirrors bookmarks — they are device-local by design', async () => {
      chrome.storage.local.__seed({ syncEnabled: true });

      await store.set({ bookmarks: [{ name: 'Private', url: 'https://example.com' }] });

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect(store.syncKeys).not.toContain('bookmarks');
    });

    test('never mirrors lifecycle telemetry', async () => {
      chrome.storage.local.__seed({ syncEnabled: true });

      await store.set({ lastSeen: 1, browserLastStartup: 2, lastNotified: 3 });

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      for (const key of [
        'lastSeen',
        'browserLastStartup',
        'lastNotified',
        'onboardingDone',
      ]) {
        expect(store.syncKeys).not.toContain(key);
      }
    });

    test('mirrors only the syncable subset of a mixed patch', async () => {
      chrome.storage.local.__seed({ syncEnabled: true });

      await store.set({ theme: 'light', bookmarks: [], lastSeen: 99 });

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ theme: 'light' });
    });

    test('keeps local authoritative when sync storage rejects', async () => {
      chrome.storage.local.__seed({ syncEnabled: true });
      chrome.storage.sync.set.mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'));

      await expect(store.set({ theme: 'dark' })).resolves.not.toThrow();
      expect((await store.getAll()).theme).toBe('dark');
    });
  });

  describe('pullSyncIfEnabled', () => {
    test('is a no-op while sync is disabled', async () => {
      await store.pullSyncIfEnabled();
      expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    });

    test('copies synced settings into local when enabled', async () => {
      chrome.storage.local.__seed({ syncEnabled: true });
      chrome.storage.sync.__seed({ theme: 'dark', searchEngine: 'kagi' });

      await store.pullSyncIfEnabled();

      const settings = await store.getAll();
      expect(settings.theme).toBe('dark');
      expect(settings.searchEngine).toBe('kagi');
    });

    test('survives an unavailable sync backend', async () => {
      chrome.storage.local.__seed({ syncEnabled: true, theme: 'light' });
      chrome.storage.sync.get.mockRejectedValueOnce(new Error('sync disabled'));

      await expect(store.pullSyncIfEnabled()).resolves.not.toThrow();
      expect((await store.getAll()).theme).toBe('light');
    });
  });

  describe('getBookmarks', () => {
    test('returns the stored bookmarks', async () => {
      await store.set({ bookmarks: [{ name: 'Example', url: 'https://example.com' }] });
      // Normalised on read, so the URL comes back in canonical form.
      expect(await store.getBookmarks()).toEqual([
        { name: 'Example', url: 'https://example.com/' },
      ]);
    });

    test('falls back to defaults when the stored value is not an array', async () => {
      chrome.storage.local.__seed({ bookmarks: 'corrupted' });

      const bookmarks = await store.getBookmarks();
      expect(Array.isArray(bookmarks)).toBe(true);
      expect(bookmarks.length).toBeGreaterThan(0);
    });
  });

  describe('schema contract', () => {
    test('every syncable key exists in the default schema', () => {
      for (const key of store.syncKeys) {
        expect(store.keys).toContain(key);
      }
    });

    test('keys matches the default schema exactly', () => {
      expect([...store.keys].sort()).toEqual(Object.keys(store.defaults).sort());
    });
  });

  /**
   * The suite above loads store.js with only its two hard dependencies, which
   * exercises the graceful-degradation guards. These load the full set a real
   * page loads, so the delegated normalisation actually runs.
   */
  describe('with every normaliser present', () => {
    beforeEach(async () => {
      await loadScripts(
        'compat.js',
        'url.js',
        'dom.js',
        'icons.js',
        'favicon.js',
        'appearance.js',
        'backgrounds.js',
        'store.js'
      );
      store = globalThis.CUSTM_STORE;
    });

    test('repairs an appearance object that arrived corrupted', async () => {
      chrome.storage.local.__seed({
        appearance: { surface: 'liquid', clock: { size: 500, font: 'Wingdings' } },
      });

      const settings = await store.getAll();
      expect(settings.appearance.surface).toBe('glass');
      expect(settings.appearance.clock.size).toBe(globalThis.CUSTM_APPEARANCE.maxSize);
      expect(settings.appearance.clock.font).toBe('system');
    });

    test('accepts the site icon mode added for the favicon fix', async () => {
      chrome.storage.local.__seed({ iconMode: 'site' });
      expect((await store.getAll()).iconMode).toBe('site');
    });

    test('falls back to the default icon mode for an unknown value', async () => {
      chrome.storage.local.__seed({ iconMode: 'google-beacon' });
      expect((await store.getAll()).iconMode).toBe('local');
    });

    describe('the background picture', () => {
      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

      test('keeps a raster data URL this app could have written', async () => {
        chrome.storage.local.__seed({ backgroundImage: PNG });
        expect((await store.getAll()).backgroundImage).toBe(PNG);
      });

      /**
       * The value is interpolated into a CSS url() on a privileged extension
       * origin. Anything outside the three raster types is discarded rather
       * than sanitised — there is no legitimate reason for it to be there.
       */
      test('discards anything that is not one of the three raster types', async () => {
        const hostile = [
          'data:image/svg+xml;base64,PHN2Zy8+',
          'data:text/html;base64,PHNjcmlwdD4=',
          'https://evil.example/pic.png',
          'javascript:alert(1)',
          'data:image/png;base64,abc");background:url(https://evil.example',
          42,
          {},
        ];
        for (const value of hostile) {
          chrome.storage.local.__seed({ backgroundImage: value });
          expect((await store.getAll()).backgroundImage, String(value)).toBe('');
        }
      });

      test('is never synced — one picture exceeds the whole sync quota', () => {
        expect(store.neverSyncKeys).toContain('backgroundImage');
        expect(store.syncKeys).not.toContain('backgroundImage');
      });

      test('is left out of a settings export, along with the credentials', () => {
        const exported = store.toExport({
          theme: 'dark',
          backgroundImage: PNG,
          pexelsApiKey: 'secret',
        });
        expect(exported).toEqual({ theme: 'dark' });
      });
    });

    test('appearance is syncable, since it holds no credential and no blob', () => {
      expect(store.syncKeys).toContain('appearance');
      expect(store.neverSyncKeys).not.toContain('appearance');
    });
  });
});
