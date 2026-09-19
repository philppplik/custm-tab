import { describe, test, expect, beforeEach } from 'vitest';
import { loadScript } from './helpers/load-script.js';

describe('CUSTM_ENGINES registry', () => {
  let engines;

  beforeEach(async () => {
    await loadScript('search-engines.js');
    engines = globalThis.CUSTM_ENGINES;
  });

  test('exposes the documented public surface', () => {
    expect(Array.isArray(engines.all)).toBe(true);
    expect(typeof engines.top).toBe('function');
    expect(typeof engines.getById).toBe('function');
    expect(typeof engines.buildUrl).toBe('function');
  });

  test('every engine id is unique', () => {
    const ids = engines.all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every engine carries a complete, well-formed definition', () => {
    for (const engine of engines.all) {
      expect(engine.id, `${engine.name} id`).toMatch(/^[a-z0-9_]+$/);
      expect(engine.name, `${engine.id} name`).toBeTruthy();
      expect(engine.icon, `${engine.id} icon`).toBeTruthy();
      expect(['high', 'medium', 'low'], `${engine.id} privacy`).toContain(engine.privacy);
    }
  });

  test('every engine URL is https and contains the {query} placeholder', () => {
    for (const engine of engines.all) {
      expect(engine.url, `${engine.id} url`).toContain('{query}');
      expect(engine.url.startsWith('https://'), `${engine.id} must use https`).toBe(true);
      // Parseable once the placeholder is filled — a malformed template would
      // otherwise only fail at navigation time.
      expect(() => new URL(engine.url.replace('{query}', 'x'))).not.toThrow();
    }
  });

  test('top() resolves to five real engines, privacy-forward first', () => {
    const top = engines.top();
    expect(top).toHaveLength(5);
    for (const engine of top) {
      expect(engines.all).toContain(engine);
    }
    expect(top[0].id).toBe('duckduckgo');
    expect(top[1].id).toBe('brave');
    // The curated list is the project's privacy promise: no tracker may lead.
    expect(top[0].privacy).toBe('high');
    expect(top[1].privacy).toBe('high');
  });

  describe('getById', () => {
    test('returns the matching engine', () => {
      expect(engines.getById('brave').name).toBe('Brave Search');
    });

    test('falls back to the first engine for an unknown id', () => {
      expect(engines.getById('does-not-exist')).toBe(engines.all[0]);
    });

    test('falls back rather than throwing on a nullish id', () => {
      expect(engines.getById(undefined)).toBe(engines.all[0]);
      expect(engines.getById(null)).toBe(engines.all[0]);
    });
  });

  describe('buildUrl', () => {
    test('substitutes the query', () => {
      expect(engines.buildUrl('duckduckgo', 'cats')).toBe(
        'https://duckduckgo.com/?q=cats'
      );
    });

    test('percent-encodes spaces', () => {
      expect(engines.buildUrl('duckduckgo', 'black cats')).toContain('q=black%20cats');
    });

    test('percent-encodes characters that would otherwise inject query params', () => {
      const url = engines.buildUrl('duckduckgo', 'a&b=c');
      expect(url).toContain('a%26b%3Dc');
      // Exactly one parameter survives — the injection did not split the query.
      expect(new URL(url).searchParams.get('q')).toBe('a&b=c');
    });

    test('round-trips unicode', () => {
      const url = engines.buildUrl('ecosia', 'Fahrräder für Köln');
      expect(new URL(url).searchParams.get('q')).toBe('Fahrräder für Köln');
    });

    test('cannot be used to escape the engine origin', () => {
      const url = engines.buildUrl('duckduckgo', 'https://evil.example/#');
      expect(new URL(url).origin).toBe('https://duckduckgo.com');
    });

    test('uses the fallback engine for an unknown id', () => {
      expect(engines.buildUrl('nope', 'cats')).toBe(
        engines.all[0].url.replace('{query}', 'cats')
      );
    });

    test('handles an empty query without producing a malformed URL', () => {
      expect(() => new URL(engines.buildUrl('duckduckgo', ''))).not.toThrow();
    });
  });
});
