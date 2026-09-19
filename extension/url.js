/**
 * cust*m Tab — URL validation and normalisation
 *
 * Every URL that reaches an `href`, a `src`, or `location` goes through here
 * first, whether it came from a text field, from storage, or from an imported
 * settings file.
 *
 * THE TRAP THIS CLOSES
 * --------------------
 * `new URL(input)` succeeding does not mean the URL is safe to navigate to.
 * `new URL('javascript:alert(document.cookie)')` parses perfectly. So does
 * `data:text/html,<script>...</script>`. Both execute in the extension's own
 * origin if handed to an `<a href>` on the new-tab page, which is a privileged
 * context holding every setting the user has.
 *
 * The protocol must therefore be checked against an allowlist — never against
 * a denylist, because a denylist loses to the next scheme someone invents.
 *
 * Attaches `CUSTM_URL`.
 */
(function (global) {
  'use strict';

  /** Protocols a bookmark or search result may ever use. */
  const NAVIGABLE_PROTOCOLS = Object.freeze(['http:', 'https:']);

  /**
   * Additional protocols the redirect target may use. These are deliberate,
   * user-typed choices in Settings, not values that arrive from a page.
   *
   * `file:` additionally requires the user to grant file access in the browser;
   * `moz-extension:` is Firefox's equivalent of `chrome-extension:`.
   */
  const TARGET_PROTOCOLS = Object.freeze([
    ...NAVIGABLE_PROTOCOLS,
    'file:',
    'chrome-extension:',
    'moz-extension:',
  ]);

  /** Tab, line feed, carriage return: removed from anywhere in a URL. */

  const STRIPPED_ANYWHERE = /[\u0009\u000A\u000D]/g;

  /** C0 controls and space: trimmed from the ends of a URL. */

  const TRIMMED_AT_ENDS = /^[\u0000-\u0020]+|[\u0000-\u0020]+$/g;

  /** Any scheme prefix, e.g. `https:`, `javascript:`, `moz-extension:`. */
  const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;

  /**
   * `host:port` looks exactly like `scheme:rest` to a naive check, so
   * `localhost:3000` would be read as the scheme `localhost:` and rejected.
   * A colon followed only by digits is a port.
   */
  const HOST_PORT = /^[a-z0-9-]+(\.[a-z0-9-]+)*:\d+([/?#]|$)/i;

  /** True when the value really starts with a URL scheme, not a host:port. */
  function hasScheme(value) {
    return SCHEME_PREFIX.test(value) && !HOST_PORT.test(value);
  }

  /**
   * Apply the same cleanup the WHATWG URL parser does, so a protocol check
   * sees what the browser will see.
   *
   * Without stripping tabs and newlines, `java<TAB>script:alert(1)` passes a
   * naive prefix check and then executes anyway, because the browser removes
   * the tab before resolving the scheme.
   *
   * Interior spaces are deliberately preserved, so `"my site"` stays invalid
   * instead of quietly becoming `https://mysite`.
   */
  function scrub(input) {
    return String(input ?? '')
      .replace(STRIPPED_ANYWHERE, '')
      .replace(TRIMMED_AT_ENDS, '');
  }

  /** Parse without throwing. Returns a `URL` or `null`. */
  function parse(input) {
    try {
      return new URL(scrub(input));
    } catch {
      return null;
    }
  }

  /**
   * True when `input` is safe to place in an `href` or navigate to.
   * Anything unparseable, or on a protocol outside the allowlist, is false.
   */
  function isNavigable(input) {
    const url = parse(input);
    return url !== null && NAVIGABLE_PROTOCOLS.includes(url.protocol);
  }

  /**
   * Decide whether the user typed a destination or a search query.
   *
   * Deliberately conservative: when in doubt this returns false and the input
   * becomes a search, which is recoverable. Guessing "URL" wrongly navigates
   * somewhere the user did not ask for, which is not.
   */
  function looksLikeUrl(input) {
    const value = scrub(input);
    if (!value || /\s/.test(value)) return false;

    // An explicit scheme is only honoured when it is one we would navigate to.
    if (hasScheme(value)) return isNavigable(value);

    // localhost, with or without a port.
    if (/^localhost(:\d+)?([/?#]|$)/i.test(value)) return true;

    // host.tld, with a TLD of at least two letters. Requires a label before
    // the dot, so "1.5" and ".com" stay searches rather than navigations.
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([/?#]|$)/i.test(value);
  }

  /**
   * Normalise a bookmark URL.
   *
   * @param {string} input Raw user input.
   * @returns {{ok: true, url: string} | {ok: false, reason: string}}
   *   `reason` is a message key, resolved by the caller for display.
   */
  function normalizeBookmarkUrl(input) {
    const value = scrub(input);
    if (!value) return { ok: false, reason: 'urlEmpty' };
    if (/\s/.test(value)) return { ok: false, reason: 'urlMalformed' };

    // Bare host: assume https rather than http. Silently downgrading to an
    // insecure scheme would be a worse default than failing to load.
    const candidate = hasScheme(value) ? value : `https://${value}`;

    const url = parse(candidate);
    if (!url) return { ok: false, reason: 'urlMalformed' };
    if (!NAVIGABLE_PROTOCOLS.includes(url.protocol)) {
      return { ok: false, reason: 'urlUnsafeProtocol' };
    }
    if (!url.hostname) return { ok: false, reason: 'urlNoHost' };

    return { ok: true, url: url.href };
  }

  /**
   * Normalise the new-tab redirect target, which may additionally be a local
   * file or another extension page.
   *
   * @returns {{ok: true, url: string, kind: string} | {ok: false, reason: string}}
   */
  function normalizeTargetUrl(input) {
    const value = scrub(input);
    if (!value) return { ok: false, reason: 'urlEmpty' };

    const candidate = hasScheme(value) ? value : `https://${value}`;

    const url = parse(candidate);
    if (!url) return { ok: false, reason: 'urlMalformed' };
    if (!TARGET_PROTOCOLS.includes(url.protocol)) {
      return { ok: false, reason: 'urlUnsafeProtocol' };
    }

    let kind = 'web';
    if (url.protocol === 'file:') {
      kind = 'file';
    } else if (
      url.protocol === 'chrome-extension:' ||
      url.protocol === 'moz-extension:'
    ) {
      kind = 'extension';
    }

    if (kind === 'web' && !url.hostname) return { ok: false, reason: 'urlNoHost' };

    return { ok: true, url: url.href, kind };
  }

  /** Hostname of a URL, or '' when it has none. Never throws. */
  function hostnameOf(input) {
    return parse(input)?.hostname ?? '';
  }

  /**
   * Display name for a URL: hostname without a leading `www.`.
   * Used for bookmark labels and attribution lines.
   */
  function displayHost(input) {
    return hostnameOf(input).replace(/^www\./i, '');
  }

  /**
   * Origin of a navigable URL, or '' otherwise. Used to scope a favicon
   * lookup so a long path never leaks into an icon request.
   */
  function originOf(input) {
    const url = parse(input);
    if (!url || !NAVIGABLE_PROTOCOLS.includes(url.protocol)) return '';
    return url.origin;
  }

  global.CUSTM_URL = {
    navigableProtocols: NAVIGABLE_PROTOCOLS,
    targetProtocols: TARGET_PROTOCOLS,
    scrub,
    parse,
    isNavigable,
    looksLikeUrl,
    normalizeBookmarkUrl,
    normalizeTargetUrl,
    hostnameOf,
    displayHost,
    originOf,
  };
})(typeof self !== 'undefined' ? self : window);
