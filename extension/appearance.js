/**
 * cust*m Tab — Appearance engine
 *
 * Everything about *how the interface itself looks*, as opposed to what sits
 * behind it. `backgrounds.js` owns the background; this owns the surfaces and
 * the type drawn on top of it.
 *
 * THE PREMISE
 * -----------
 * "Your tab. Your rules." A new-tab page is the most-seen screen in a browser,
 * and every other one ships a fixed idea of what belongs there. So the parts a
 * product would normally hard-code are settings instead:
 *
 *   surface   the material the interface is made of — glass, frosted, solid
 *   clock     shown or not, 12h or 24h, seconds, size, weight, typeface
 *   greeting  the time-of-day line, your own words, or nothing at all
 *
 * A user who wants an empty tab with one search field can have exactly that,
 * and a user who wants a big rounded clock and their name can have that too.
 *
 * HOW IT IS APPLIED
 * -----------------
 * As CSS custom properties and one `data-surface` attribute on <html>, never
 * as inline styles on individual elements. The stylesheet keeps ownership of
 * the design, this module only supplies the values — so the options page gets
 * the same treatment for free by calling `apply` on its own document.
 *
 * Attaches `CUSTM_APPEARANCE`.
 */
(function (global) {
  'use strict';

  /**
   * Interface materials.
   *
   * `glass` and `frosted` differ in more than blur radius: frosted also pushes
   * saturation, which is what makes real frosted glass read as glass rather
   * than as a grey panel. `solid` turns the blur off entirely — it is the
   * honest choice on a low-end machine, where a full-screen backdrop filter is
   * the single most expensive thing this page can do.
   */
  const SURFACES = Object.freeze(['glass', 'frosted', 'solid']);
  const TONES = Object.freeze(['dark', 'light']);

  /**
   * Typefaces, restricted to families the operating system already has.
   *
   * A web font would mean a network request on every new tab, which is the
   * tracker this project removed in 1.2.0 wearing a different hat. Each stack
   * therefore names the platform face first and degrades to a generic.
   */
  const FONTS = Object.freeze({
    system: {
      name: 'System',
      stack:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    },
    rounded: {
      name: 'Rounded',
      stack:
        "ui-rounded, 'SF Pro Rounded', 'Segoe UI Variable Display', 'Nunito', 'Quicksand', system-ui, sans-serif",
    },
    serif: {
      name: 'Serif',
      stack: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
    },
    mono: {
      name: 'Mono',
      stack:
        "ui-monospace, 'SF Mono', 'Cascadia Mono', 'Segoe UI Mono', Consolas, monospace",
    },
  });

  const CLOCK_FORMATS = Object.freeze(['auto', '12', '24']);
  const GREETING_MODES = Object.freeze(['time', 'text', 'none']);

  /** Weight range offered in the UI. 100-800 covers every stack above. */
  const MIN_WEIGHT = 100;
  const MAX_WEIGHT = 800;

  /**
   * Clock scale, as a multiplier on the stylesheet's base size.
   *
   * A multiplier rather than a pixel value so the clock stays responsive: the
   * base is already a clamp() against viewport width, and a stored `72px`
   * would overflow a narrow window.
   */
  const MIN_SIZE = 0.5;
  const MAX_SIZE = 2.5;

  const MAX_NAME_LENGTH = 32;
  const MAX_TEXT_LENGTH = 48;

  const DEFAULTS = Object.freeze({
    surface: 'glass',
    solidTone: 'dark',
    clock: Object.freeze({
      show: true,
      seconds: false,
      format: 'auto', // follow the browser locale
      size: 1,
      weight: 200,
      font: 'system',
    }),
    date: Object.freeze({ show: true }),
    greeting: Object.freeze({
      mode: 'time',
      name: '',
      text: 'cust*m Tab',
    }),
  });

  /** Time-of-day greetings, keyed the same way `greetingKey` returns. */
  const GREETINGS = Object.freeze({
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good night',
  });

  function oneOf(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function text(value, max) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /**
   * Coerce arbitrary stored data into a usable configuration.
   *
   * Storage is untrusted — a synced value can arrive from a newer version, and
   * an imported settings file is entirely attacker-controlled. A bad value here
   * would become a CSS custom property, so every field is clamped to a known
   * set or a numeric range; nothing is passed through.
   */
  function normalize(value) {
    const input = value && typeof value === 'object' ? value : {};
    const clock = input.clock && typeof input.clock === 'object' ? input.clock : {};
    const date = input.date && typeof input.date === 'object' ? input.date : {};
    const greeting =
      input.greeting && typeof input.greeting === 'object' ? input.greeting : {};

    const weight = clamp(clock.weight, MIN_WEIGHT, MAX_WEIGHT, DEFAULTS.clock.weight);

    return {
      surface: oneOf(input.surface, SURFACES, DEFAULTS.surface),
      solidTone: oneOf(input.solidTone, TONES, DEFAULTS.solidTone),
      clock: {
        show: clock.show !== false,
        seconds: clock.seconds === true,
        format: oneOf(clock.format, CLOCK_FORMATS, DEFAULTS.clock.format),
        size: clamp(clock.size, MIN_SIZE, MAX_SIZE, DEFAULTS.clock.size),
        // Rounded to the nearest 100 so the value always maps to a real face
        // rather than one the browser has to synthesise.
        weight: Math.round(weight / 100) * 100,
        font: FONTS[clock.font] ? clock.font : DEFAULTS.clock.font,
      },
      date: { show: date.show !== false },
      greeting: {
        mode: oneOf(greeting.mode, GREETING_MODES, DEFAULTS.greeting.mode),
        name: text(greeting.name, MAX_NAME_LENGTH),
        text: text(greeting.text, MAX_TEXT_LENGTH),
      },
    };
  }

  /** Which greeting belongs to an hour of the day. */
  function greetingKey(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * The greeting line to render, or '' when there should be none.
   *
   * @param {object} appearance Normalised configuration.
   * @param {Date} [now] Injectable so this is testable without faking a clock.
   */
  function greetingFor(appearance, now = new Date()) {
    const config = normalize(appearance).greeting;

    if (config.mode === 'none') return '';
    if (config.mode === 'text') return config.text;

    const base = GREETINGS[greetingKey(now.getHours())];
    return config.name ? `${base}, ${config.name}` : base;
  }

  /**
   * Format the time according to the user's choice.
   *
   * `auto` defers to the browser locale, which is the right default: a German
   * user gets 24-hour and an American user gets 12-hour without either having
   * to find a setting. The explicit options exist for everyone the locale
   * guesses wrong about.
   */
  function formatClock(appearance, now = new Date(), locale = 'en') {
    const config = normalize(appearance).clock;

    const options = { hour: '2-digit', minute: '2-digit' };
    if (config.seconds) options.second = '2-digit';
    if (config.format === '12') options.hour12 = true;
    if (config.format === '24') options.hour12 = false;

    return now.toLocaleTimeString(locale, options);
  }

  /**
   * Write the configuration onto a document.
   *
   * Sets `data-surface` plus the type custom properties, and returns the theme
   * the surface implies so the caller can reconcile it with the background and
   * the user's own theme choice. A solid surface dictates its own theme — an
   * opaque white panel with white text on it is unreadable no matter what the
   * background is doing.
   *
   * @returns {string|null} 'light', 'dark', or null when the surface has no
   *   opinion and the background should decide.
   */
  function apply(doc, appearance) {
    const config = normalize(appearance);
    const root = doc.documentElement;
    const style = root.style;

    root.setAttribute('data-surface', config.surface);

    style.setProperty('--ct-clock-font', FONTS[config.clock.font].stack);
    style.setProperty('--ct-clock-weight', String(config.clock.weight));
    style.setProperty('--ct-clock-scale', String(config.clock.size));

    return config.surface === 'solid' ? config.solidTone : null;
  }

  global.CUSTM_APPEARANCE = {
    surfaces: SURFACES,
    tones: TONES,
    fonts: FONTS,
    clockFormats: CLOCK_FORMATS,
    greetingModes: GREETING_MODES,
    greetings: GREETINGS,
    defaults: DEFAULTS,
    minWeight: MIN_WEIGHT,
    maxWeight: MAX_WEIGHT,
    minSize: MIN_SIZE,
    maxSize: MAX_SIZE,
    maxNameLength: MAX_NAME_LENGTH,
    maxTextLength: MAX_TEXT_LENGTH,
    normalize,
    greetingKey,
    greetingFor,
    formatClock,
    apply,
  };
})(typeof self !== 'undefined' ? self : window);
