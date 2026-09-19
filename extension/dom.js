/**
 * cust*m Tab — Safe DOM construction
 *
 * WHY THIS EXISTS
 * ---------------
 * Every rendering bug this project has shipped came from the same line shape:
 *
 *     item.innerHTML = `<span class="label">${bookmark.name}</span>`;
 *
 * `bookmark.name` is user data. A bookmark named
 * `<img src=x onerror=alert(document.cookie)>` executes on the new-tab page,
 * which is a privileged extension origin holding every setting the user has.
 * The same applies to values arriving from an imported settings file, which is
 * fully attacker-controlled.
 *
 * `el()` sets text through `textContent` and attributes through
 * `setAttribute`, so markup in a value is displayed, never parsed. URLs are
 * additionally checked against `CUSTM_URL` before reaching `href` or `src`.
 *
 * Attaches `CUSTM_DOM`.
 */
(function (global) {
  'use strict';

  /** Attributes whose value is a URL and must be validated before assignment. */
  const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction']);

  /** Event-handler attributes are never settable through this helper. */
  const EVENT_ATTRIBUTE = /^on/i;

  /**
   * Create an element.
   *
   * @param {string} tag
   * @param {object} [props]
   *   `text`    - assigned via textContent (markup is never parsed)
   *   `class`   - className
   *   `dataset` - object of data-* values
   *   `style`   - object of inline style properties
   *   `on`      - object of event name to listener
   *   any other key becomes an attribute.
   * @param {Array<Node|string>} [children]
   * @returns {HTMLElement}
   */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;

      if (key === 'text') {
        node.textContent = String(value);
        continue;
      }
      if (key === 'class' || key === 'className') {
        node.className = String(value);
        continue;
      }
      if (key === 'dataset') {
        for (const [dataKey, dataValue] of Object.entries(value)) {
          node.dataset[dataKey] = String(dataValue);
        }
        continue;
      }
      if (key === 'style') {
        for (const [prop, propValue] of Object.entries(value)) {
          node.style.setProperty(prop, String(propValue));
        }
        continue;
      }
      if (key === 'on') {
        for (const [event, listener] of Object.entries(value)) {
          node.addEventListener(event, listener);
        }
        continue;
      }

      // Inline handlers are how an "attribute" becomes code execution.
      // There is no legitimate use for them here; listeners go through `on`.
      if (EVENT_ATTRIBUTE.test(key)) continue;

      if (URL_ATTRIBUTES.has(key)) {
        // A rejected URL leaves the attribute unset rather than half-set, so a
        // blocked bookmark renders as an inert tile instead of a live link.
        if (global.CUSTM_URL && global.CUSTM_URL.isNavigable(value)) {
          node.setAttribute(key, global.CUSTM_URL.scrub(value));
        }
        continue;
      }

      if (value === true) {
        node.setAttribute(key, '');
        continue;
      }
      node.setAttribute(key, String(value));
    }

    append(node, children);
    return node;
  }

  /** Append children, skipping nullish entries and wrapping strings as text. */
  function append(parent, children) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      parent.appendChild(
        typeof child === 'string' || typeof child === 'number'
          ? document.createTextNode(String(child))
          : child
      );
    }
    return parent;
  }

  /** Remove every child of `node`. */
  function clear(node) {
    if (!node) return node;
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /** Build a DocumentFragment, so a list renders in one reflow. */
  function fragment(children = []) {
    return append(document.createDocumentFragment(), children);
  }

  /**
   * Replace the contents of `node` in a single operation.
   * The batching matters on the new-tab page, which renders on every tab open.
   */
  function replace(node, children) {
    if (!node) return node;
    clear(node);
    node.appendChild(fragment(children));
    return node;
  }

  /**
   * Create an inline SVG icon from one or more path definitions.
   *
   * Two shapes of icon live in this app and they need opposite defaults:
   * interface glyphs are drawn as strokes, while the vendored brand marks in
   * `icons.js` are solid silhouettes that disappear entirely when stroked.
   * `fill: true` switches to the filled treatment. Either way the icon paints
   * in `currentColor`, so one mark works on light, dark and photo backgrounds.
   */
  function svg(paths, options = {}) {
    const { size = 16, viewBox = '0 0 24 24', className = '', fill = false } = options;
    const NS = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(NS, 'svg');
    root.setAttribute('viewBox', viewBox);
    root.setAttribute('width', String(size));
    root.setAttribute('height', String(size));
    if (fill) {
      root.setAttribute('fill', 'currentColor');
    } else {
      root.setAttribute('fill', 'none');
      root.setAttribute('stroke', 'currentColor');
      root.setAttribute('stroke-width', '2');
      root.setAttribute('stroke-linecap', 'round');
      root.setAttribute('stroke-linejoin', 'round');
    }
    root.setAttribute('aria-hidden', 'true');
    if (className) root.setAttribute('class', className);

    for (const d of [].concat(paths)) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      root.appendChild(path);
    }
    return root;
  }

  global.CUSTM_DOM = { el, append, clear, fragment, replace, svg };
})(typeof self !== 'undefined' ? self : window);
