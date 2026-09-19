import { describe, test, expect, beforeEach } from 'vitest';
import { loadScripts } from './helpers/load-script.js';

describe('CUSTM_APPEARANCE', () => {
  let appearance;

  beforeEach(async () => {
    await loadScripts('compat.js', 'appearance.js');
    appearance = globalThis.CUSTM_APPEARANCE;
  });

  /**
   * Every value here becomes a CSS custom property on a privileged extension
   * origin, and storage is untrusted: a synced value can arrive from a newer
   * version and an imported settings file is entirely attacker-controlled.
   * Nothing may pass through unchecked.
   */
  describe('normalising untrusted storage', () => {
    test('falls back to the defaults for a missing configuration', () => {
      for (const value of [null, undefined, 'nonsense', 42, []]) {
        const config = appearance.normalize(value);
        expect(config.surface).toBe('glass');
        expect(config.clock.show).toBe(true);
        expect(config.greeting.mode).toBe('time');
      }
    });

    test('rejects a surface that is not one of the three materials', () => {
      expect(appearance.normalize({ surface: 'liquid' }).surface).toBe('glass');
      expect(appearance.normalize({ surface: 'frosted' }).surface).toBe('frosted');
    });

    test('clamps the clock scale into the supported range', () => {
      expect(appearance.normalize({ clock: { size: 99 } }).clock.size).toBe(
        appearance.maxSize
      );
      expect(appearance.normalize({ clock: { size: -5 } }).clock.size).toBe(
        appearance.minSize
      );
      expect(appearance.normalize({ clock: { size: 'big' } }).clock.size).toBe(1);
    });

    test('rounds the weight to a hundred so no face has to be synthesised', () => {
      expect(appearance.normalize({ clock: { weight: 237 } }).clock.weight).toBe(200);
      expect(appearance.normalize({ clock: { weight: 9999 } }).clock.weight).toBe(800);
      expect(appearance.normalize({ clock: { weight: 0 } }).clock.weight).toBe(100);
    });

    test('rejects a typeface that is not in the registry', () => {
      expect(appearance.normalize({ clock: { font: 'Comic Sans' } }).clock.font).toBe(
        'system'
      );
    });

    test('truncates and collapses the greeting strings', () => {
      const config = appearance.normalize({
        greeting: { name: '  Philipp\n\tPaulik  ', text: 'x'.repeat(500) },
      });
      expect(config.greeting.name).toBe('Philipp Paulik');
      expect(config.greeting.text).toHaveLength(appearance.maxTextLength);
    });

    test('a hostile object cannot smuggle a value into a custom property', () => {
      const config = appearance.normalize({
        surface: 'glass"; background: url(https://evil.example)',
        clock: { font: '"; content: "' },
      });
      expect(config.surface).toBe('glass');
      expect(appearance.fonts[config.clock.font]).toBeDefined();
    });
  });

  describe('greeting', () => {
    const at = (hour) => new Date(2026, 0, 15, hour, 0, 0);

    test('follows the time of day', () => {
      const config = appearance.normalize({ greeting: { mode: 'time' } });
      expect(appearance.greetingFor(config, at(8))).toBe('Good morning');
      expect(appearance.greetingFor(config, at(14))).toBe('Good afternoon');
      expect(appearance.greetingFor(config, at(19))).toBe('Good evening');
      expect(appearance.greetingFor(config, at(2))).toBe('Good night');
    });

    test('appends the name the user configured', () => {
      const config = appearance.normalize({
        greeting: { mode: 'time', name: 'Philipp' },
      });
      expect(appearance.greetingFor(config, at(8))).toBe('Good morning, Philipp');
    });

    test('omits the comma entirely when no name is set', () => {
      const config = appearance.normalize({ greeting: { mode: 'time', name: '   ' } });
      expect(appearance.greetingFor(config, at(8))).toBe('Good morning');
    });

    test('shows the user own words instead, when they chose that', () => {
      const config = appearance.normalize({
        greeting: { mode: 'text', text: 'cust*m Tab', name: 'ignored' },
      });
      expect(appearance.greetingFor(config, at(8))).toBe('cust*m Tab');
    });

    test('renders nothing at all in none mode', () => {
      const config = appearance.normalize({ greeting: { mode: 'none' } });
      expect(appearance.greetingFor(config, at(8))).toBe('');
    });
  });

  describe('clock format', () => {
    const afternoon = new Date(2026, 0, 15, 13, 5, 9);

    test('honours an explicit 24-hour choice regardless of locale', () => {
      const config = appearance.normalize({ clock: { format: '24' } });
      expect(appearance.formatClock(config, afternoon, 'en-US')).toContain('13');
    });

    test('honours an explicit 12-hour choice regardless of locale', () => {
      const config = appearance.normalize({ clock: { format: '12' } });
      const text = appearance.formatClock(config, afternoon, 'de-DE');
      expect(text).toMatch(/1[:.]05/);
      expect(text.startsWith('13')).toBe(false);
    });

    test('adds seconds only when asked', () => {
      const plain = appearance.normalize({ clock: { format: '24' } });
      const detailed = appearance.normalize({ clock: { format: '24', seconds: true } });
      expect(appearance.formatClock(plain, afternoon, 'en-GB')).toBe('13:05');
      expect(appearance.formatClock(detailed, afternoon, 'en-GB')).toBe('13:05:09');
    });
  });

  describe('apply', () => {
    test('writes the material and the type properties onto the document', () => {
      const config = appearance.normalize({
        surface: 'frosted',
        clock: { weight: 600, size: 1.5, font: 'mono' },
      });
      appearance.apply(document, config);

      const root = document.documentElement;
      expect(root.getAttribute('data-surface')).toBe('frosted');
      expect(root.style.getPropertyValue('--ct-clock-weight')).toBe('600');
      expect(root.style.getPropertyValue('--ct-clock-scale')).toBe('1.5');
      expect(root.style.getPropertyValue('--ct-clock-font')).toContain('monospace');
    });

    /**
     * An opaque white panel cannot carry white text whatever the background
     * is doing, so a solid surface has to be able to override the theme the
     * background would otherwise pick.
     */
    test('a solid surface dictates its own theme', () => {
      expect(appearance.apply(document, { surface: 'solid', solidTone: 'light' })).toBe(
        'light'
      );
      expect(appearance.apply(document, { surface: 'solid', solidTone: 'dark' })).toBe(
        'dark'
      );
    });

    test('a translucent surface leaves the theme to the background', () => {
      expect(appearance.apply(document, { surface: 'glass' })).toBeNull();
      expect(appearance.apply(document, { surface: 'frosted' })).toBeNull();
    });
  });
});
