import { describe, test, expect, beforeEach } from 'vitest';
import { loadScripts } from './helpers/load-script.js';

describe('CUSTM_ICONS', () => {
  let icons;
  let engines;

  beforeEach(async () => {
    await loadScripts('compat.js', 'dom.js', 'icons.js', 'search-engines.js');
    icons = globalThis.CUSTM_ICONS;
    engines = globalThis.CUSTM_ENGINES;
  });

  /**
   * `icons.js` is generated. These guard the contract the generator promises,
   * so a bad regeneration fails here rather than shipping blank squares.
   */
  describe('the generated registry', () => {
    test('every glyph carries a viewBox and real path data', () => {
      for (const [ref, glyph] of Object.entries(icons.glyphs)) {
        expect(glyph.viewBox, ref).toMatch(/^0 0 \d+ \d+$/);
        expect(glyph.paths.length, ref).toBeGreaterThan(0);
        for (const d of glyph.paths) {
          // An SVG path has to open with a move command; anything else is
          // truncated or mangled data.
          expect(d, ref).toMatch(/^[Mm]/);
        }
      }
    });

    test('every referenced icon actually exists in the registry', () => {
      for (const [id, ref] of Object.entries(icons.engineIcons)) {
        expect(icons.glyphs[ref], `${id} -> ${ref}`).toBeDefined();
      }
      expect(icons.glyphs[icons.fallback]).toBeDefined();
    });

    test('every engine in the registry resolves to a drawable glyph', () => {
      for (const engine of engines.all) {
        const glyph = icons.forEngine(engine.id);
        expect(glyph, engine.id).toBeDefined();
        expect(glyph.paths.length, engine.id).toBeGreaterThan(0);
      }
    });

    test('an unknown engine id still gets the fallback rather than nothing', () => {
      expect(icons.forEngine('does-not-exist')).toBe(icons.glyphs[icons.fallback]);
      expect(icons.forEngine(undefined)).toBe(icons.glyphs[icons.fallback]);
    });

    test('the five engines shown in the dashboard all have their own mark', () => {
      for (const engine of engines.top()) {
        expect(icons.engineIcons[engine.id], engine.id).toBeDefined();
        expect(icons.forEngine(engine.id), engine.id).not.toBe(
          icons.glyphs[icons.fallback]
        );
      }
    });
  });

  describe('rendering', () => {
    test('builds a filled SVG that inherits the surrounding colour', () => {
      const svg = icons.engineIcon('google');
      expect(svg.tagName.toLowerCase()).toBe('svg');
      // Filled, not stroked: these are solid silhouettes and would vanish.
      expect(svg.getAttribute('fill')).toBe('currentColor');
      expect(svg.getAttribute('stroke')).toBeNull();
      expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
    });

    test('is hidden from assistive technology, since the label carries it', () => {
      expect(icons.engineIcon('brave').getAttribute('aria-hidden')).toBe('true');
    });

    test('honours a requested size', () => {
      const svg = icons.engineIcon('duckduckgo', { size: 24 });
      expect(svg.getAttribute('width')).toBe('24');
      expect(svg.getAttribute('height')).toBe('24');
    });

    /**
     * The whole point of vendoring the path data: a new tab must not tell an
     * icon CDN that it was opened. That was the Google favicon beacon removed
     * in 1.2.0, and an icon font would reintroduce it.
     */
    test('no glyph references a remote resource', () => {
      const serialised = JSON.stringify(icons.glyphs);
      expect(serialised).not.toMatch(/https?:\/\//);
      expect(serialised).not.toMatch(/url\(/i);
    });
  });
});
