import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
import { REPO_ROOT } from './helpers/load-script.js';
import { describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';

const parserWindow = new Window({
  settings: { disableCSSFileLoading: true, disableJavaScriptEvaluation: true },
});
const harnessDocument = new parserWindow.DOMParser().parseFromString(
  readFileSync(join(REPO_ROOT, 'tools/preview/preview.html'), 'utf8'),
  'text/html'
);
const harness = harnessDocument.querySelector('script').textContent;

async function preview(query) {
  const fetch = vi.fn(async () => ({ text: async () => '<body></body>' }));
  const document = {
    body: { textContent: '', replaceChildren: vi.fn() },
    querySelectorAll: () => [],
    documentElement: { setAttribute: vi.fn() },
  };
  class DOMParser {
    parseFromString() {
      return {
        querySelectorAll: () => [],
        body: { childNodes: [] },
      };
    }
  }
  runInNewContext(harness, {
    URLSearchParams,
    location: { search: query },
    atob,
    console,
    fetch,
    document,
    DOMParser,
    setTimeout: vi.fn(),
  });
  // Let the async mount (including its rejection handler) finish.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { fetch, document };
}

describe('preview page allowlist', () => {
  it.each(['newtab', 'options', 'wizard'])(
    'loads only the literal extension URL for %s',
    async (page) => {
      const result = await preview(`?page=${page}`);
      expect(result.fetch).toHaveBeenCalledExactlyOnceWith(
        `../../extension/${page}.html`
      );
      expect(result.document.body.replaceChildren).toHaveBeenCalledOnce();
    }
  );

  it('defaults to newtab only when page is absent', async () => {
    const result = await preview('');
    expect(result.fetch).toHaveBeenCalledExactlyOnceWith('../../extension/newtab.html');
  });

  it.each([
    '',
    '../tools/preview/promo',
    '../../other',
    '/options',
    '//example.com/page',
    'https://example.com/page',
    'newtab/../options',
    'newtab?redirect=options',
    'newtab#fragment',
    'NEWtab',
    '__proto__',
    'constructor',
    'toString',
    '%2e%2e%2foptions',
  ])('rejects %j before any fetch or HTML insertion', async (page) => {
    const result = await preview(`?page=${encodeURIComponent(page)}`);
    expect(result.fetch).not.toHaveBeenCalled();
    expect(result.document.body.replaceChildren).not.toHaveBeenCalled();
    expect(result.document.body.textContent).toBe(
      'preview harness failed: unsupported preview page'
    );
  });
});
