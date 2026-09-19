import { describe, test, expect, beforeEach } from 'vitest';
import { loadScript } from './helpers/load-script.js';

describe('CUSTM_URL', () => {
  let url;

  beforeEach(async () => {
    await loadScript('url.js');
    url = globalThis.CUSTM_URL;
  });

  /**
   * The security core. Each of these parses cleanly with `new URL()`, which is
   * exactly why a parse-succeeded check is not a safety check. If any ever
   * starts being accepted, a bookmark can execute script in the extension's own
   * origin — where every setting the user has is readable.
   */
  describe('rejects script-bearing protocols', () => {
    const payloads = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'JAVASCRIPT:alert(1)',
      'javascript:void(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'blob:https://example.com/abc',
      'about:blank',
      'filesystem:https://example.com/temporary/x',
    ];

    test.each(payloads)('rejects %s as a bookmark', (payload) => {
      const result = url.normalizeBookmarkUrl(payload);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('urlUnsafeProtocol');
    });

    test.each(payloads)('reports %s as not navigable', (payload) => {
      expect(url.isNavigable(payload)).toBe(false);
    });

    test.each(payloads)('never treats %s as a URL to navigate to', (payload) => {
      expect(url.looksLikeUrl(payload)).toBe(false);
    });
  });

  /**
   * A browser strips tab, LF and CR from a URL before resolving the scheme, so
   * a check that only inspects the literal prefix can be walked straight past.
   */
  describe('rejects protocols obfuscated with control characters', () => {
    const payloads = [
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'java\rscript:alert(1)',
      'jav\ta\nscr\ript:alert(1)',
      '  javascript:alert(1)',
      'javascript:alert(1)  ',
      '\u0000javascript:alert(1)',
      '\u0001\u0002javascript:alert(1)',
    ];

    test.each(payloads)('rejects %j', (payload) => {
      expect(url.normalizeBookmarkUrl(payload).ok).toBe(false);
      expect(url.isNavigable(payload)).toBe(false);
    });

    test('scrub reproduces what the URL parser sees', () => {
      expect(url.scrub('java\tscript:x')).toBe('javascript:x');
      expect(url.scrub('  https://a.com  ')).toBe('https://a.com');
      // Interior spaces survive, so "my site" cannot become a hostname.
      expect(url.scrub('my site')).toBe('my site');
    });
  });

  describe('normalizeBookmarkUrl', () => {
    test('accepts an absolute https URL unchanged in substance', () => {
      const result = url.normalizeBookmarkUrl('https://example.com/a?b=c#d');
      expect(result).toEqual({ ok: true, url: 'https://example.com/a?b=c#d' });
    });

    test('upgrades a bare host to https, never http', () => {
      expect(url.normalizeBookmarkUrl('youtube.com').url).toBe('https://youtube.com/');
    });

    test('preserves an explicit http URL the user chose', () => {
      expect(url.normalizeBookmarkUrl('http://example.com').url).toBe(
        'http://example.com/'
      );
    });

    test('handles host:port without mistaking the port for a scheme', () => {
      expect(url.normalizeBookmarkUrl('localhost:3000').ok).toBe(true);
    });

    test('rejects empty and whitespace-only input', () => {
      for (const value of ['', '   ', '\t\n', null, undefined]) {
        expect(url.normalizeBookmarkUrl(value).reason).toBe('urlEmpty');
      }
    });

    test('rejects a value containing an interior space', () => {
      expect(url.normalizeBookmarkUrl('my site').reason).toBe('urlMalformed');
    });

    test('rejects file: — a bookmark tile is not the place for it', () => {
      expect(url.normalizeBookmarkUrl('file:///C:/x.html').reason).toBe(
        'urlUnsafeProtocol'
      );
    });

    test('rejects a scheme with no host', () => {
      expect(url.normalizeBookmarkUrl('https://').ok).toBe(false);
    });
  });

  describe('normalizeTargetUrl', () => {
    test('classifies a web target', () => {
      const result = url.normalizeTargetUrl('notion.so');
      expect(result).toMatchObject({ ok: true, kind: 'web', url: 'https://notion.so/' });
    });

    test('accepts a local file and classifies it', () => {
      const result = url.normalizeTargetUrl('file:///C:/dashboard.html');
      expect(result).toMatchObject({ ok: true, kind: 'file' });
    });

    test('accepts a Chrome extension page', () => {
      expect(url.normalizeTargetUrl('chrome-extension://abc/page.html')).toMatchObject({
        ok: true,
        kind: 'extension',
      });
    });

    test('accepts a Firefox extension page', () => {
      // Firefox uses moz-extension:; omitting it broke redirect mode there.
      expect(url.normalizeTargetUrl('moz-extension://abc/page.html')).toMatchObject({
        ok: true,
        kind: 'extension',
      });
    });

    test('still rejects script protocols, even for a user-typed target', () => {
      expect(url.normalizeTargetUrl('javascript:alert(1)').reason).toBe(
        'urlUnsafeProtocol'
      );
      expect(url.normalizeTargetUrl('data:text/html,x').reason).toBe('urlUnsafeProtocol');
    });
  });

  describe('looksLikeUrl', () => {
    test('treats multi-word input as a search', () => {
      for (const query of ['black cats', 'how to cook rice', 'what is 2 + 2']) {
        expect(url.looksLikeUrl(query), query).toBe(false);
      }
    });

    test('treats a bare word as a search, not a hostname', () => {
      for (const query of ['cats', 'reddit', 'typescript']) {
        expect(url.looksLikeUrl(query), query).toBe(false);
      }
    });

    test('recognises a host with a TLD', () => {
      for (const value of ['youtube.com', 'a.co', 'sub.domain.example.org/path']) {
        expect(url.looksLikeUrl(value), value).toBe(true);
      }
    });

    test('recognises localhost with and without a port', () => {
      expect(url.looksLikeUrl('localhost')).toBe(true);
      expect(url.looksLikeUrl('localhost:8080')).toBe(true);
    });

    test('does not mistake a decimal number for a hostname', () => {
      for (const value of ['1.5', '3.14', '2.0']) {
        expect(url.looksLikeUrl(value), value).toBe(false);
      }
    });

    test('does not accept a bare TLD', () => {
      expect(url.looksLikeUrl('.com')).toBe(false);
    });
  });

  describe('host helpers', () => {
    test('hostnameOf extracts the host', () => {
      expect(url.hostnameOf('https://www.example.com/path')).toBe('www.example.com');
    });

    test('displayHost drops a leading www.', () => {
      expect(url.displayHost('https://www.example.com/path')).toBe('example.com');
      expect(url.displayHost('https://example.com')).toBe('example.com');
    });

    test('originOf scopes to the origin, dropping path and query', () => {
      expect(url.originOf('https://example.com/a/b?c=d#e')).toBe('https://example.com');
    });

    test('originOf refuses a non-navigable protocol', () => {
      expect(url.originOf('javascript:alert(1)')).toBe('');
      expect(url.originOf('file:///C:/x.html')).toBe('');
    });

    test('host helpers never throw on malformed input', () => {
      for (const value of ['', 'not a url', null, undefined, '://']) {
        expect(() => url.hostnameOf(value)).not.toThrow();
        expect(() => url.displayHost(value)).not.toThrow();
        expect(() => url.originOf(value)).not.toThrow();
      }
    });
  });

  describe('protocol allowlists are frozen', () => {
    // A mutable allowlist is a mutable security boundary.
    test('navigable protocols cannot be extended at runtime', () => {
      expect(Object.isFrozen(url.navigableProtocols)).toBe(true);
      expect(url.navigableProtocols).not.toContain('javascript:');
    });

    test('target protocols cannot be extended at runtime', () => {
      expect(Object.isFrozen(url.targetProtocols)).toBe(true);
    });
  });
});
