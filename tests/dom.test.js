import { describe, test, expect, beforeEach, vi } from 'vitest';
import { loadScripts } from './helpers/load-script.js';

describe('CUSTM_DOM', () => {
  let dom;

  beforeEach(async () => {
    await loadScripts('compat.js', 'url.js', 'dom.js');
    dom = globalThis.CUSTM_DOM;
    document.body.replaceChildren();
  });

  /**
   * The whole point of this module. Each payload is a plausible bookmark name;
   * the previous implementation interpolated them into an HTML string.
   */
  describe('never parses a value as markup', () => {
    const payloads = [
      '<img src=x onerror=alert(1)>',
      '<script>alert(1)</script>',
      '"><script>alert(1)</script>',
      "'><img src=x onerror=alert(1)>",
      '<svg onload=alert(1)>',
      '</span><iframe src=javascript:alert(1)>',
    ];

    test.each(payloads)('renders %s as text', (payload) => {
      const node = dom.el('span', { text: payload });
      document.body.appendChild(node);

      expect(node.textContent).toBe(payload);
      // No element was created from the payload.
      expect(node.querySelector('img,script,svg,iframe')).toBeNull();
      expect(node.children).toHaveLength(0);
    });

    test.each(payloads)('renders %s safely as a child', (payload) => {
      const node = dom.el('div', {}, [payload]);
      expect(node.textContent).toBe(payload);
      expect(node.children).toHaveLength(0);
    });

    test.each(payloads)('keeps %s inert in an attribute', (payload) => {
      const node = dom.el('div', { title: payload });
      expect(node.getAttribute('title')).toBe(payload);
      expect(node.children).toHaveLength(0);
    });
  });

  describe('URL attributes', () => {
    test('sets a safe https href', () => {
      const node = dom.el('a', { href: 'https://example.com/x' });
      expect(node.getAttribute('href')).toBe('https://example.com/x');
    });

    test.each([
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'java\tscript:alert(1)',
    ])('refuses to set href=%j', (payload) => {
      const node = dom.el('a', { href: payload });
      // Unset rather than half-set: the tile renders inert instead of live.
      expect(node.hasAttribute('href')).toBe(false);
    });

    test('refuses an unsafe src', () => {
      const node = dom.el('img', { src: 'javascript:alert(1)' });
      expect(node.hasAttribute('src')).toBe(false);
    });

    test('guards action and formaction too', () => {
      expect(
        dom.el('form', { action: 'javascript:alert(1)' }).hasAttribute('action')
      ).toBe(false);
      expect(
        dom.el('button', { formaction: 'javascript:alert(1)' }).hasAttribute('formaction')
      ).toBe(false);
    });
  });

  describe('inline event handlers', () => {
    test.each(['onclick', 'onerror', 'onload', 'ONCLICK', 'onMouseOver'])(
      'silently drops %s',
      (attribute) => {
        const node = dom.el('div', { [attribute]: 'alert(1)' });
        expect(node.hasAttribute(attribute.toLowerCase())).toBe(false);
      }
    );

    test('registers listeners through `on` instead', () => {
      const handler = vi.fn();
      const node = dom.el('button', { on: { click: handler } });
      node.click();
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('el', () => {
    test('sets className via class', () => {
      expect(dom.el('div', { class: 'a b' }).className).toBe('a b');
    });

    test('sets dataset entries', () => {
      expect(dom.el('div', { dataset: { index: 3 } }).dataset.index).toBe('3');
    });

    test('sets style properties, including custom properties', () => {
      const node = dom.el('div', { style: { '--tile-hue': '210', color: 'red' } });
      expect(node.style.getPropertyValue('--tile-hue')).toBe('210');
      expect(node.style.color).toBe('red');
    });

    test('skips null, undefined and false props', () => {
      const node = dom.el('div', { title: null, lang: undefined, hidden: false });
      expect(node.hasAttribute('title')).toBe(false);
      expect(node.hasAttribute('lang')).toBe(false);
      expect(node.hasAttribute('hidden')).toBe(false);
    });

    test('renders a true prop as a bare attribute', () => {
      expect(dom.el('div', { hidden: true }).hasAttribute('hidden')).toBe(true);
    });

    test('appends element and text children in order', () => {
      const node = dom.el('p', {}, ['a', dom.el('b', { text: 'B' }), 'c']);
      expect(node.textContent).toBe('aBc');
    });

    test('skips nullish children rather than rendering "null"', () => {
      const node = dom.el('p', {}, ['a', null, undefined, false, 'b']);
      expect(node.textContent).toBe('ab');
    });

    test('renders a numeric child', () => {
      expect(dom.el('p', {}, [0]).textContent).toBe('0');
    });
  });

  describe('clear and replace', () => {
    test('clear removes every child', () => {
      const node = dom.el('div', {}, ['a', dom.el('span'), 'b']);
      dom.clear(node);
      expect(node.childNodes).toHaveLength(0);
    });

    test('replace swaps the contents', () => {
      const node = dom.el('div', {}, ['old']);
      dom.replace(node, [dom.el('span', { text: 'new' })]);
      expect(node.textContent).toBe('new');
      expect(node.children).toHaveLength(1);
    });

    test('clear and replace tolerate a missing node', () => {
      expect(() => dom.clear(null)).not.toThrow();
      expect(() => dom.replace(null, [])).not.toThrow();
    });
  });

  describe('fragment', () => {
    test('batches children into one insertion', () => {
      const frag = dom.fragment([dom.el('i'), dom.el('i'), dom.el('i')]);
      expect(frag.childNodes).toHaveLength(3);
    });
  });

  describe('svg', () => {
    test('creates a namespaced svg with paths', () => {
      const icon = dom.svg(['M0 0 L10 10', 'M10 0 L0 10'], { size: 24 });
      expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(icon.getAttribute('width')).toBe('24');
      expect(icon.querySelectorAll('path')).toHaveLength(2);
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    });

    test('accepts a single path string', () => {
      expect(dom.svg('M0 0 L1 1').querySelectorAll('path')).toHaveLength(1);
    });
  });
});
