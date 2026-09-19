/**
 * cust*m Tab — Background engine
 *
 * Three kinds of background, one code path:
 *
 *   gradient  the signature ambient blobs, in a choice of palettes
 *   color     a single flat colour the user picks
 *   photo     a Pexels image, with a scrim and optional blur
 *
 * CONTRAST IS COMPUTED, NOT GUESSED
 * ---------------------------------
 * Letting someone choose any colour means they will choose a pale yellow, and
 * white-on-pale-yellow is unreadable. Rather than forbidding light colours,
 * the text colour is derived from the background's relative luminance, so the
 * user keeps the freedom and the interface stays legible either way.
 *
 * Attaches `CUSTM_BACKGROUND`.
 */
(function (global) {
  'use strict';

  const TYPES = Object.freeze(['gradient', 'color', 'photo']);

  /**
   * Gradient palettes. Each is three ambient blobs over a deep base, extending
   * the original brand treatment rather than replacing it.
   */
  const GRADIENTS = Object.freeze({
    aurora: { name: 'Aurora', base: '#180646', blobs: ['#29058e', '#ff3300', '#edd30f'] },
    dusk: { name: 'Dusk', base: '#1a0b2e', blobs: ['#5b2c8d', '#c1436d', '#f5a26b'] },
    tide: { name: 'Tide', base: '#04202c', blobs: ['#065a6b', '#0aa6a6', '#9fe8c0'] },
    ember: { name: 'Ember', base: '#2b0a05', blobs: ['#7c1d0b', '#d9480f', '#ffc078'] },
    slate: { name: 'Slate', base: '#0f1115', blobs: ['#232a34', '#3d4654', '#6b7684'] },
    bloom: { name: 'Bloom', base: '#2a0a24', blobs: ['#7b1d5c', '#d6336c', '#ffd8a8'] },
  });

  /**
   * Curated flat colours. A picker alone leaves people staring at a rainbow;
   * a short list of colours known to work gets them to a good result in one
   * click, with the picker still there for anyone who wants it.
   */
  const SWATCHES = Object.freeze([
    '#180646',
    '#0f1115',
    '#1b3a4b',
    '#0b3d2e',
    '#3d1d2b',
    '#4a2511',
    '#f4f1fb',
    '#e8e6e1',
    '#dbe4ee',
    '#ffffff',
  ]);

  const DEFAULTS = Object.freeze({
    type: 'gradient',
    gradient: 'aurora',
    color: '#180646',
    overlay: 0.35, // scrim over a photo, 0-0.8
    blur: 0, // photo blur in px, 0-24
  });

  const MAX_OVERLAY = 0.8;
  const MAX_BLUR = 24;

  /** Parse `#rgb` or `#rrggbb` into `{r, g, b}`, or null. */
  function parseHex(value) {
    const hex = String(value || '').trim();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
    if (short) {
      return {
        r: parseInt(short[1] + short[1], 16),
        g: parseInt(short[2] + short[2], 16),
        b: parseInt(short[3] + short[3], 16),
      };
    }
    const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!long) return null;
    return {
      r: parseInt(long[1], 16),
      g: parseInt(long[2], 16),
      b: parseInt(long[3], 16),
    };
  }

  /** Relative luminance per WCAG 2.1, used to choose a readable text colour. */
  function luminance(value) {
    const rgb = parseHex(value);
    if (!rgb) return 0;
    const channel = (raw) => {
      const c = raw / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  /**
   * Which theme reads better on this colour.
   *
   * 0.45 rather than 0.5: the interface layers translucent white surfaces on
   * top, which lightens the effective background, so the switch to dark text
   * needs to happen slightly earlier than a naive midpoint.
   */
  function themeForColor(value) {
    return luminance(value) > 0.45 ? 'light' : 'dark';
  }

  /** Clamp a number into a range, tolerating strings and nonsense. */
  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  /** Coerce arbitrary stored data into a usable background configuration. */
  function normalize(value) {
    const input = value && typeof value === 'object' ? value : {};
    const color = parseHex(input.color) ? input.color : DEFAULTS.color;
    return {
      type: TYPES.includes(input.type) ? input.type : DEFAULTS.type,
      gradient: GRADIENTS[input.gradient] ? input.gradient : DEFAULTS.gradient,
      color,
      overlay: clamp(input.overlay, 0, MAX_OVERLAY, DEFAULTS.overlay),
      blur: clamp(input.blur, 0, MAX_BLUR, DEFAULTS.blur),
    };
  }

  /**
   * Apply a background to a document.
   *
   * @param {Document} doc
   * @param {object} background Configuration, normalised internally.
   * @param {object|null} photo Resolved Pexels photo, when type is 'photo'.
   * @returns {string} The theme the caller should apply: 'light' or 'dark'.
   */
  function apply(doc, background, photo) {
    const config = normalize(background);
    const root = doc.documentElement;
    const style = root.style;

    root.setAttribute('data-bg', config.type);

    if (config.type === 'color') {
      style.setProperty('--ct-bg-deep', config.color);
      // A flat colour needs no blobs; hiding them avoids painting three large
      // blurred layers that would never be seen.
      style.setProperty('--ct-blob-opacity', '0');
      style.setProperty('--ct-photo-image', 'none');
      return themeForColor(config.color);
    }

    if (config.type === 'photo' && photo && photo.src) {
      // Paint the photo's average colour immediately, so the tab is never a
      // white flash while the image downloads.
      style.setProperty('--ct-bg-deep', photo.avgColor || DEFAULTS.color);
      style.setProperty('--ct-blob-opacity', '0');
      style.setProperty('--ct-photo-image', `url("${encodeURI(photo.src)}")`);
      style.setProperty('--ct-photo-overlay', String(config.overlay));
      style.setProperty('--ct-photo-blur', `${config.blur}px`);
      // A photo sits under a dark scrim, so light text is always correct.
      return 'dark';
    }

    // Gradient, and the fallback whenever a photo could not be resolved.
    const palette = GRADIENTS[config.gradient] || GRADIENTS[DEFAULTS.gradient];
    style.setProperty('--ct-bg-deep', palette.base);
    style.setProperty('--ct-purple', palette.blobs[0]);
    style.setProperty('--ct-red', palette.blobs[1]);
    style.setProperty('--ct-yellow', palette.blobs[2]);
    style.setProperty('--ct-blob-opacity', '1');
    style.setProperty('--ct-photo-image', 'none');
    return themeForColor(palette.base);
  }

  /**
   * Run the sunrise reveal: the ambient blobs grow and brighten from below,
   * the way light comes up over a horizon.
   *
   * Implemented as a class the stylesheet animates rather than scripted
   * keyframes, so it runs on the compositor and costs nothing on the main
   * thread while the rest of the page is still wiring itself up.
   *
   * Honours `prefers-reduced-motion`: the animation is decorative, and for
   * someone with vestibular sensitivity a large growing shape is exactly the
   * kind of motion that causes symptoms.
   *
   * @returns {boolean} Whether the animation actually ran.
   */
  function playSunrise(doc, enabled) {
    const root = doc.documentElement;
    const view = doc.defaultView;
    const reduced =
      view &&
      typeof view.matchMedia === 'function' &&
      view.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!enabled || reduced) {
      root.classList.add('ct-sunrise-done');
      return false;
    }

    root.classList.add('ct-sunrise');
    return true;
  }

  global.CUSTM_BACKGROUND = {
    types: TYPES,
    gradients: GRADIENTS,
    swatches: SWATCHES,
    defaults: DEFAULTS,
    maxOverlay: MAX_OVERLAY,
    maxBlur: MAX_BLUR,
    parseHex,
    luminance,
    themeForColor,
    normalize,
    apply,
    playSunrise,
  };
})(typeof self !== 'undefined' ? self : window);
