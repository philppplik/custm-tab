import { describe, test, expect, beforeEach, vi } from 'vitest';
import { loadScripts, readExtensionFile } from './helpers/load-script.js';

/**
 * End-to-end render of the new-tab page.
 *
 * Unit tests prove each module behaves; they cannot prove the page is wired
 * together. This loads the real `newtab.html` body and evaluates the real
 * scripts in the order the page declares, so a missing global, a renamed
 * element id, or a script listed in the wrong order fails here rather than on
 * a user's first tab.
 */

/**
 * Parse newtab.html with a real HTML parser.
 *
 * Deliberately not regex: a pattern like `/<script.*?<\/script>/` misses
 * `<SCRIPT>` and `</script >`, which is precisely the class of bug that makes
 * regex-based tag filtering unsafe. Using DOMParser means the test reads the
 * page the way a browser does.
 */
function parsePage() {
  return new DOMParser().parseFromString(readExtensionFile('newtab.html'), 'text/html');
}

/** Script order as declared by newtab.html, read from the parsed document. */
function scriptOrder() {
  return [...parsePage().querySelectorAll('script[src]')].map((el) =>
    el.getAttribute('src')
  );
}

/** Install the page body into the test document, minus its script tags. */
function mountPage() {
  const doc = parsePage();
  // The scripts are evaluated explicitly afterwards, in declared order.
  doc.querySelectorAll('script').forEach((el) => el.remove());
  document.body.replaceChildren(
    ...[...doc.body.childNodes].map((node) => document.importNode(node, true))
  );
}

/** Let the page's async boot IIFE settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('new tab page', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-bg');
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    mountPage();
  });

  const boot = async () => {
    await loadScripts(...scriptOrder());
    await settle();
  };

  test('the declared script order satisfies every dependency', () => {
    const order = scriptOrder();
    // compat.js defines CUSTM_API, which store.js reads at evaluation time.
    expect(order.indexOf('compat.js')).toBeLessThan(order.indexOf('store.js'));
    // dom.js consults CUSTM_URL when setting href/src.
    expect(order.indexOf('url.js')).toBeLessThan(order.indexOf('dom.js'));
    // The controller runs last.
    expect(order.at(-1)).toBe('newtab.js');
  });

  test('renders the dashboard without throwing', async () => {
    await boot();
    expect(document.body.classList.contains('is-ready')).toBe(true);
  });

  test('renders one tile per bookmark, plus the add tile', async () => {
    chrome.storage.local.__seed({
      bookmarks: [
        { name: 'Example', url: 'https://example.com' },
        { name: 'Other', url: 'https://other.test' },
      ],
    });
    await boot();

    const grid = document.getElementById('shortcuts-grid');
    expect(grid.querySelectorAll('.sc-item')).toHaveLength(3);
    expect(grid.textContent).toContain('Example');
    expect(grid.textContent).toContain('Other');
  });

  /** The bug this whole release exists to close, verified on the real page. */
  test('a bookmark name containing markup is rendered as text', async () => {
    chrome.storage.local.__seed({
      bookmarks: [{ name: '<img src=x onerror=alert(1)>', url: 'https://example.com' }],
    });
    await boot();

    const grid = document.getElementById('shortcuts-grid');
    expect(grid.querySelector('img[onerror]')).toBeNull();
    expect(grid.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  /** A stored profile can hold anything; an unsafe URL must not become a link. */
  test('a bookmark with a javascript: URL is dropped before it renders', async () => {
    chrome.storage.local.__seed({
      bookmarks: [
        { name: 'Bad', url: 'javascript:alert(1)' },
        { name: 'Good', url: 'https://example.com' },
      ],
    });
    await boot();

    const links = [...document.querySelectorAll('#shortcuts-grid a')];
    expect(
      links.every((a) => String(a.getAttribute('href')).startsWith('https://'))
    ).toBe(true);
    expect(document.body.innerHTML).not.toContain('javascript:');
  });

  test('applies the stored theme, which the page previously ignored', async () => {
    chrome.storage.local.__seed({ theme: 'light' });
    await boot();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test('a solid light background drives the interface to dark text', async () => {
    chrome.storage.local.__seed({
      theme: 'auto',
      background: { type: 'color', color: '#ffffff' },
    });
    await boot();

    expect(document.documentElement.getAttribute('data-bg')).toBe('color');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test('an explicit theme still wins over what the background suggests', async () => {
    chrome.storage.local.__seed({
      theme: 'dark',
      background: { type: 'color', color: '#ffffff' },
    });
    await boot();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('photo mode falls back to the gradient when no key is configured', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    chrome.storage.local.__seed({
      background: { type: 'photo' },
      pexelsApiKey: '',
    });
    await boot();

    // No key must mean no request, and a usable tab rather than a blank one.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute('data-bg')).toBe('gradient');
  });

  test('runs the sunrise reveal by default', async () => {
    await boot();
    expect(document.documentElement.classList.contains('ct-sunrise')).toBe(true);
  });

  test('skips the sunrise reveal when the user turned it off', async () => {
    chrome.storage.local.__seed({ sunrise: false });
    await boot();
    expect(document.documentElement.classList.contains('ct-sunrise')).toBe(false);
  });

  test('populates the engine picker', async () => {
    await boot();
    const menu = document.getElementById('engine-menu');
    expect(menu.querySelectorAll('.engine-item')).toHaveLength(5);
  });

  test('marks the tab as seen for the persistence monitor', async () => {
    await boot();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ lastSeen: expect.any(Number) })
    );
  });

  test('redirect mode hides the dashboard and frames the target', async () => {
    chrome.storage.local.__seed({
      mode: 'redirect',
      targetUrl: 'https://example.com',
      maskUrl: true,
    });
    await boot();

    expect(document.getElementById('dashboard').hidden).toBe(true);
    expect(document.getElementById('redirect-frame-wrap').hidden).toBe(false);
  });

  test('an unsafe stored redirect target falls back to the dashboard', async () => {
    chrome.storage.local.__seed({
      mode: 'redirect',
      targetUrl: 'javascript:alert(1)',
      maskUrl: true,
    });
    await boot();

    // Rather than navigating, or stranding the user on an empty page.
    expect(document.getElementById('redirect-frame-wrap').hidden).toBe(true);
    expect(document.getElementById('shortcuts-grid').children.length).toBeGreaterThan(0);
  });
});
