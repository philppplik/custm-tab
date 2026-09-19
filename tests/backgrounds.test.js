import { describe, test, expect, beforeEach, vi } from 'vitest';
import { loadScripts } from './helpers/load-script.js';

describe('CUSTM_BACKGROUND', () => {
  let bg;

  beforeEach(async () => {
    await loadScripts('compat.js', 'backgrounds.js');
    bg = globalThis.CUSTM_BACKGROUND;
    document.documentElement.removeAttribute('data-bg');
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  describe('parseHex', () => {
    test('parses six-digit hex', () => {
      expect(bg.parseHex('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
    });

    test('expands three-digit hex', () => {
      expect(bg.parseHex('#f80')).toEqual({ r: 255, g: 136, b: 0 });
    });

    test('is case-insensitive', () => {
      expect(bg.parseHex('#AABBCC')).toEqual(bg.parseHex('#aabbcc'));
    });

    test('rejects anything that is not a hex colour', () => {
      const bad = ['red', 'rgb(1,2,3)', '#12345', '', null, undefined, '#gggggg'];
      for (const value of bad) {
        expect(bg.parseHex(value), String(value)).toBeNull();
      }
    });
  });

  /**
   * The point of computing contrast: a user is free to pick a pale colour, and
   * the interface has to stay readable rather than rendering white on cream.
   */
  describe('themeForColor', () => {
    test('chooses dark text on a light background', () => {
      for (const light of ['#ffffff', '#f4f1fb', '#e8e6e1', '#dbe4ee']) {
        expect(bg.themeForColor(light), light).toBe('light');
      }
    });

    test('chooses light text on a dark background', () => {
      for (const dark of ['#000000', '#180646', '#0f1115', '#1b3a4b', '#3d1d2b']) {
        expect(bg.themeForColor(dark), dark).toBe('dark');
      }
    });

    test('treats an unparseable colour as dark rather than throwing', () => {
      expect(bg.themeForColor('not-a-colour')).toBe('dark');
    });

    test('luminance is ordered correctly', () => {
      expect(bg.luminance('#ffffff')).toBeGreaterThan(bg.luminance('#808080'));
      expect(bg.luminance('#808080')).toBeGreaterThan(bg.luminance('#000000'));
      expect(bg.luminance('#000000')).toBe(0);
    });
  });

  describe('normalize', () => {
    test('fills in defaults for empty input', () => {
      expect(bg.normalize(undefined)).toEqual(bg.defaults);
      expect(bg.normalize(null)).toEqual(bg.defaults);
      expect(bg.normalize('nonsense')).toEqual(bg.defaults);
    });

    test('rejects an unknown type', () => {
      expect(bg.normalize({ type: 'hologram' }).type).toBe('gradient');
    });

    test('rejects an unknown gradient', () => {
      expect(bg.normalize({ gradient: 'chartreuse' }).gradient).toBe('aurora');
    });

    test('rejects a malformed colour', () => {
      expect(bg.normalize({ color: 'red' }).color).toBe(bg.defaults.color);
    });

    test('clamps the overlay into range', () => {
      expect(bg.normalize({ overlay: 5 }).overlay).toBe(bg.maxOverlay);
      expect(bg.normalize({ overlay: -1 }).overlay).toBe(0);
      expect(bg.normalize({ overlay: 'abc' }).overlay).toBe(bg.defaults.overlay);
    });

    test('clamps the blur into range', () => {
      expect(bg.normalize({ blur: 999 }).blur).toBe(bg.maxBlur);
      expect(bg.normalize({ blur: -4 }).blur).toBe(0);
    });

    test('accepts a full valid configuration unchanged', () => {
      const input = {
        type: 'photo',
        gradient: 'tide',
        color: '#112233',
        overlay: 0.5,
        blur: 8,
      };
      expect(bg.normalize(input)).toEqual(input);
    });
  });

  describe('apply', () => {
    const style = () => document.documentElement.style;

    test('gradient sets the palette and shows the blobs', () => {
      const theme = bg.apply(document, { type: 'gradient', gradient: 'tide' }, null);
      expect(document.documentElement.getAttribute('data-bg')).toBe('gradient');
      expect(style().getPropertyValue('--ct-bg-deep')).toBe(bg.gradients.tide.base);
      expect(style().getPropertyValue('--ct-blob-opacity')).toBe('1');
      expect(theme).toBe('dark');
    });

    test('solid colour hides the blobs and returns the readable theme', () => {
      const theme = bg.apply(document, { type: 'color', color: '#ffffff' }, null);
      expect(document.documentElement.getAttribute('data-bg')).toBe('color');
      expect(style().getPropertyValue('--ct-bg-deep')).toBe('#ffffff');
      expect(style().getPropertyValue('--ct-blob-opacity')).toBe('0');
      expect(theme).toBe('light');
    });

    test('photo sets the image, scrim and blur, and always returns dark', () => {
      const theme = bg.apply(
        document,
        { type: 'photo', overlay: 0.5, blur: 6 },
        { src: 'https://images.pexels.com/photo.jpg', avgColor: '#334455' }
      );
      expect(document.documentElement.getAttribute('data-bg')).toBe('photo');
      expect(style().getPropertyValue('--ct-photo-image')).toContain('photo.jpg');
      expect(style().getPropertyValue('--ct-photo-overlay')).toBe('0.5');
      expect(style().getPropertyValue('--ct-photo-blur')).toBe('6px');
      // The photo's own average colour paints instantly, avoiding a white flash.
      expect(style().getPropertyValue('--ct-bg-deep')).toBe('#334455');
      expect(theme).toBe('dark');
    });

    test('photo type with no photo falls back to the gradient', () => {
      bg.apply(document, { type: 'photo', gradient: 'ember' }, null);
      expect(style().getPropertyValue('--ct-photo-image')).toBe('none');
      expect(style().getPropertyValue('--ct-bg-deep')).toBe(bg.gradients.ember.base);
    });

    test('encodes the photo URL so it cannot break out of the CSS url()', () => {
      bg.apply(
        document,
        { type: 'photo' },
        { src: 'https://images.pexels.com/a b".jpg', avgColor: '#000000' }
      );
      const value = style().getPropertyValue('--ct-photo-image');
      expect(value).toContain('%20');
      expect(value).toContain('%22');
    });
  });

  describe('playSunrise', () => {
    const setReducedMotion = (matches) => {
      window.matchMedia = vi.fn().mockReturnValue({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    };

    test('runs when enabled and motion is not reduced', () => {
      setReducedMotion(false);
      expect(bg.playSunrise(document, true)).toBe(true);
      expect(document.documentElement.classList.contains('ct-sunrise')).toBe(true);
    });

    test('is skipped when the user turned it off', () => {
      setReducedMotion(false);
      expect(bg.playSunrise(document, false)).toBe(false);
      expect(document.documentElement.classList.contains('ct-sunrise')).toBe(false);
      expect(document.documentElement.classList.contains('ct-sunrise-done')).toBe(true);
    });

    /**
     * A large shape growing across the viewport is exactly the motion that
     * triggers vestibular symptoms. The setting must not be able to override
     * the system preference.
     */
    test('is skipped under prefers-reduced-motion even when enabled', () => {
      setReducedMotion(true);
      expect(bg.playSunrise(document, true)).toBe(false);
      expect(document.documentElement.classList.contains('ct-sunrise')).toBe(false);
    });
  });

  describe('catalogue integrity', () => {
    test('every gradient has a base and exactly three blobs', () => {
      for (const [id, palette] of Object.entries(bg.gradients)) {
        expect(bg.parseHex(palette.base), `${id} base`).not.toBeNull();
        expect(palette.blobs, `${id} blobs`).toHaveLength(3);
        for (const blob of palette.blobs) {
          expect(bg.parseHex(blob), `${id} blob ${blob}`).not.toBeNull();
        }
        expect(palette.name, `${id} name`).toBeTruthy();
      }
    });

    test('every swatch is a valid colour', () => {
      for (const swatch of bg.swatches) {
        expect(bg.parseHex(swatch), swatch).not.toBeNull();
      }
    });

    test('the swatches span both light and dark, so either theme is reachable', () => {
      const themes = new Set(bg.swatches.map(bg.themeForColor));
      expect(themes).toContain('light');
      expect(themes).toContain('dark');
    });

    test('the default configuration is itself valid', () => {
      expect(bg.normalize(bg.defaults)).toEqual(bg.defaults);
    });
  });
});
