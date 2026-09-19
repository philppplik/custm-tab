import { describe, test, expect, beforeEach } from 'vitest';
import { loadScripts } from './helpers/load-script.js';

describe('CUSTM_FAVICON', () => {
  let favicons;

  beforeEach(async () => {
    await loadScripts('compat.js', 'url.js', 'favicon.js');
    favicons = globalThis.CUSTM_FAVICON;
  });

  const bookmark = { name: 'Example', url: 'https://www.example.com/deep/path?q=1' };

  /**
   * The privacy contract. The previous implementation sent every bookmark's
   * hostname to Google on every new tab, from an extension promising no
   * tracking. Only the explicitly opt-in mode may reach the network at all.
   */
  describe('privacy contract', () => {
    test('never resolves to a Google endpoint in any mode', () => {
      for (const mode of favicons.modes) {
        const icon = favicons.resolve(bookmark, mode);
        if (icon.kind === 'image') {
          expect(icon.src, mode).not.toMatch(/google/i);
        }
      }
    });

    test('monogram mode makes no request at all', () => {
      expect(favicons.resolve(bookmark, 'monogram').kind).toBe('monogram');
    });

    test('only the remote mode discloses to a third party', () => {
      expect(favicons.disclosesToThirdParty('remote')).toBe(true);
      expect(favicons.disclosesToThirdParty('local')).toBe(false);
      expect(favicons.disclosesToThirdParty('monogram')).toBe(false);
    });

    test('an unknown mode is treated as the private default', () => {
      expect(favicons.disclosesToThirdParty('something-else')).toBe(false);
      expect(favicons.normalizeMode('something-else')).toBe('local');
      expect(favicons.normalizeMode(undefined)).toBe('local');
    });

    test('remote mode sends the hostname and nothing else', () => {
      const icon = favicons.resolve(bookmark, 'remote');
      expect(icon.kind).toBe('image');
      expect(icon.src).toContain('www.example.com');
      // The path, query and fragment must never travel with the request.
      expect(icon.src).not.toContain('deep');
      expect(icon.src).not.toContain('path');
      expect(icon.src).not.toContain('q=1');
    });

    test('an unsafe URL never becomes a network request', () => {
      for (const url of ['javascript:alert(1)', 'data:text/html,x', 'not a url', '']) {
        const icon = favicons.resolve({ name: 'X', url }, 'remote');
        expect(icon.kind, url).toBe('monogram');
      }
    });
  });

  describe('monogram', () => {
    test('uses the first character of the user label', () => {
      expect(favicons.monogramLetter('YouTube', 'https://youtube.com')).toBe('Y');
    });

    test('falls back to the hostname when the label is empty', () => {
      expect(favicons.monogramLetter('', 'https://example.com')).toBe('E');
      expect(favicons.monogramLetter('   ', 'https://example.com')).toBe('E');
    });

    test('skips leading punctuation and emoji', () => {
      expect(favicons.monogramLetter('★ Reddit', 'https://reddit.com')).toBe('R');
      expect(favicons.monogramLetter('🎬 Movies', 'https://example.com')).toBe('M');
    });

    test('handles non-Latin scripts', () => {
      expect(favicons.monogramLetter('Кино', 'https://example.com')).toBe('К');
      expect(favicons.monogramLetter('日本', 'https://example.com')).toBe('日');
    });

    test('never renders blank', () => {
      expect(favicons.monogramLetter('', '')).toBe('•');
      expect(favicons.monogramLetter('!!!', '')).toBe('•');
    });

    test('always carries a hue in range', () => {
      for (const host of ['a.com', 'b.com', 'example.org', '']) {
        const hue = favicons.hueFor(host);
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(360);
        expect(Number.isInteger(hue)).toBe(true);
      }
    });

    test('hue is deterministic, so a site keeps its colour', () => {
      expect(favicons.hueFor('example.com')).toBe(favicons.hueFor('example.com'));
    });

    test('different hosts generally get different hues', () => {
      const hues = new Set(
        ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'].map(favicons.hueFor)
      );
      // A hash collision across five inputs would make tiles indistinguishable.
      expect(hues.size).toBeGreaterThanOrEqual(4);
    });
  });

  describe('local mode', () => {
    test('falls back to a monogram where no local cache exists', () => {
      // Firefox has no `_favicon/` equivalent, so CUSTM_ENV reports false and
      // the tile must still render.
      globalThis.CUSTM_ENV = { ...globalThis.CUSTM_ENV, hasLocalFavicons: false };
      expect(favicons.resolve(bookmark, 'local').kind).toBe('monogram');
    });

    test('uses the extension-local cache where available', () => {
      globalThis.CUSTM_ENV = {
        ...globalThis.CUSTM_ENV,
        hasLocalFavicons: true,
        runtimeUrl: (p) => `chrome-extension://test/${String(p).replace(/^\//, '')}`,
      };
      const icon = favicons.resolve(bookmark, 'local');
      expect(icon.kind).toBe('image');
      // A chrome-extension: URL never leaves the browser.
      expect(icon.src.startsWith('chrome-extension://')).toBe(true);
      expect(icon.src).toContain('pageUrl=');
      // Scoped to the origin, so the path is not handed to the cache lookup.
      expect(icon.src).not.toContain('deep');
    });
  });

  describe('image results', () => {
    test('always carry a monogram fallback for onerror', () => {
      const icon = favicons.resolve(bookmark, 'remote');
      expect(icon.fallback).toMatchObject({ kind: 'monogram' });
      expect(icon.fallback.letter).toBe('E');
    });
  });

  describe('input tolerance', () => {
    test('never throws on missing or malformed input', () => {
      for (const input of [undefined, null, {}, { name: 'x' }, { url: 'x' }]) {
        expect(() => favicons.resolve(input, 'local')).not.toThrow();
        expect(favicons.resolve(input, 'local').kind).toBe('monogram');
      }
    });
  });

  /**
   * The regression this module was rewritten for: after the Google beacon was
   * removed, tile icons stopped appearing. Two separate causes, both covered
   * here, because either one alone reproduces the symptom.
   */
  describe('why the icons stopped appearing', () => {
    beforeEach(() => {
      globalThis.CUSTM_ENV = {
        ...globalThis.CUSTM_ENV,
        hasLocalFavicons: true,
        runtimeUrl: (p) => `chrome-extension://test/${String(p).replace(/^\//, '')}`,
      };
      favicons.resetProbe();
    });

    test('looks the icon up by page URL, with the trailing slash', () => {
      // Chrome keys its favicon database on page URLs. `URL.origin` drops the
      // slash, and `https://example.com` misses where `https://example.com/`
      // hits — which is why every tile fell through to the placeholder.
      expect(favicons.pageUrlFor('https://example.com')).toBe('https://example.com/');
      expect(favicons.pageUrlFor('https://example.com/deep/path')).toBe(
        'https://example.com/'
      );

      const icon = favicons.resolve(bookmark, 'local');
      expect(decodeURIComponent(icon.src)).toContain('pageUrl=https://www.example.com/');
    });

    test('marks local results as needing verification', () => {
      expect(favicons.resolve(bookmark, 'local').local).toBe(true);
      expect(favicons.resolve(bookmark, 'remote').local).toBe(false);
      expect(favicons.resolve(bookmark, 'site').local).toBe(false);
    });

    /**
     * `_favicon/` answers every request with HTTP 200, returning a generic
     * placeholder when it has nothing cached. An <img> therefore never fires
     * `error`, so the monogram fallback never ran and the grid filled with
     * identical grey glyphs.
     */
    test('recognises Chrome placeholder so the monogram can take over', async () => {
      const placeholder = new Uint8Array([1, 2, 3, 4]);
      globalThis.fetch = async () => new Response(placeholder);

      const icon = favicons.resolve(bookmark, 'local');
      await expect(favicons.verifyLocal(icon.src)).resolves.toBe(false);
    });

    test('keeps an icon whose bytes differ from the placeholder', async () => {
      globalThis.fetch = async (url) =>
        new Response(
          String(url).includes('placeholder-probe')
            ? new Uint8Array([1, 2, 3, 4])
            : new Uint8Array([9, 8, 7, 6, 5])
        );

      const icon = favicons.resolve(bookmark, 'local');
      await expect(favicons.verifyLocal(icon.src)).resolves.toBe(true);
    });

    test('probes once no matter how many bookmarks are on the grid', async () => {
      let probes = 0;
      globalThis.fetch = async (url) => {
        if (String(url).includes('placeholder-probe')) probes++;
        return new Response(new Uint8Array([1, 2, 3]));
      };

      await Promise.all(
        ['a', 'b', 'c', 'd'].map((host) =>
          favicons.verifyLocal(
            favicons.resolve({ url: `https://${host}.example` }, 'local').src
          )
        )
      );
      expect(probes).toBe(1);
    });

    /** Failing closed here would blank tiles that were perfectly fine. */
    test('keeps the icon when verification is impossible', async () => {
      globalThis.fetch = async () => {
        throw new Error('offline');
      };
      await expect(favicons.verifyLocal('chrome-extension://test/x')).resolves.toBe(true);
    });
  });

  describe('site mode', () => {
    test('asks the bookmarked site itself, and no one else', () => {
      const icon = favicons.resolve(bookmark, 'site');
      expect(icon.kind).toBe('image');
      expect(icon.src).toBe('https://www.example.com/favicon.ico');
    });

    test('is declared as disclosing to sites but not to a third party', () => {
      expect(favicons.disclosesToSites('site')).toBe(true);
      expect(favicons.disclosesToThirdParty('site')).toBe(false);
      expect(favicons.disclosesToSites('remote')).toBe(false);
      expect(favicons.disclosesToSites('local')).toBe(false);
    });

    test('never builds a request for a URL that is not navigable', () => {
      expect(favicons.resolve({ url: 'javascript:alert(1)' }, 'site').kind).toBe(
        'monogram'
      );
    });
  });
});
