import { describe, test, expect, beforeEach } from 'vitest';
import { loadScript } from './helpers/load-script.js';

describe('CUSTM_STORE', () => {
  let store;

  beforeEach(() => {
    loadScript('store.js');
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
      expect(await store.getBookmarks()).toEqual([
        { name: 'Example', url: 'https://example.com' },
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
});
