import { describe, test, expect } from 'vitest';
import { readExtensionFile } from './helpers/load-script.js';

/**
 * The contract between options.js and options.html.
 *
 * The settings page is a bootstrap that touches the DOM on load, so it sits
 * outside the unit-test allowlist. That leaves its riskiest failure mode —
 * the controller and the markup drifting apart — with nothing watching it.
 * These read both files and check they still agree.
 */

const html = readExtensionFile('options.html');
const js = readExtensionFile('options.js');
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('options page markup', () => {
  test('every id the controller looks up exists in the markup', () => {
    // `$('x')` is the page's own helper; getElementById covers the rest.
    const ids = new Set([
      ...[...js.matchAll(/\$\('([a-z0-9-]+)'\)/gi)].map((m) => m[1]),
      ...[...js.matchAll(/getElementById\('([a-z0-9-]+)'\)/gi)].map((m) => m[1]),
    ]);

    expect(ids.size).toBeGreaterThan(20);
    const missing = [...ids].filter((id) => !doc.getElementById(id));
    expect(missing).toEqual([]);
  });

  test('every script the page declares exists', () => {
    const declared = [...doc.querySelectorAll('script[src]')].map((el) =>
      el.getAttribute('src')
    );
    for (const src of declared) {
      expect(() => readExtensionFile(src), src).not.toThrow();
    }
  });

  test('the controller loads after every module it reads at evaluation time', () => {
    const order = [...doc.querySelectorAll('script[src]')].map((el) =>
      el.getAttribute('src')
    );
    for (const dependency of [
      'compat.js',
      'dom.js',
      'icons.js',
      'appearance.js',
      'backgrounds.js',
      'store.js',
    ]) {
      expect(order, dependency).toContain(dependency);
      expect(order.indexOf(dependency), dependency).toBeLessThan(
        order.indexOf('options.js')
      );
    }
  });

  /**
   * `.theme-chip` is the shared chip style for four independent radio groups.
   * Selecting them by class alone meant applyTheme() cleared the `active`
   * state off the other three every time it ran, so the material, tone and
   * greeting groups rendered with no visible selection at all. Each chip must
   * therefore declare exactly one group, and the theme handler must scope
   * itself to its own.
   */
  describe('the chip radio groups stay separable', () => {
    const GROUPS = ['theme', 'surface', 'tone', 'greeting'];

    test('every chip belongs to exactly one group', () => {
      const chips = [...doc.querySelectorAll('.theme-chip')];
      expect(chips.length).toBeGreaterThan(3);

      for (const chip of chips) {
        const owned = GROUPS.filter((group) => chip.hasAttribute(`data-${group}`));
        expect(owned, chip.outerHTML).toHaveLength(1);
      }
    });

    test('each group is present and offers a real choice', () => {
      for (const group of GROUPS) {
        expect(
          doc.querySelectorAll(`.theme-chip[data-${group}]`).length,
          group
        ).toBeGreaterThan(1);
      }
    });

    test('the theme handler selects on the attribute, not on the class alone', () => {
      expect(js).toContain('.theme-chip[data-theme]');
      expect(js).not.toMatch(/querySelectorAll\('\.theme-chip'\)/);
    });
  });

  describe('the background picker covers every supported type', () => {
    test('offers a control for all four', () => {
      const offered = [...doc.querySelectorAll('[data-bg-type]')].map(
        (el) => el.dataset.bgType
      );
      expect(offered.sort()).toEqual(['color', 'gradient', 'image', 'photo']);
    });

    test('the own-image input accepts only the three storable raster types', () => {
      const accept = doc.getElementById('bg-image-file').getAttribute('accept');
      expect(accept).toBe('image/png,image/jpeg,image/webp');
    });

    test('every panel the controller toggles exists', () => {
      for (const id of [
        'bg-gradient-settings',
        'bg-color-settings',
        'bg-photo-settings',
        'bg-image-settings',
        'bg-picture-settings',
      ]) {
        expect(doc.getElementById(id), id).not.toBeNull();
      }
    });
  });

  test('the icon picker offers every mode the resolver supports', () => {
    const offered = [...doc.querySelectorAll('#icon-mode-select option')].map(
      (el) => el.value
    );
    expect(offered.sort()).toEqual(['local', 'monogram', 'remote', 'site']);
  });
});
