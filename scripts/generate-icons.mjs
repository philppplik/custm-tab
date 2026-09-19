/**
 * Generate `extension/icons.js` — the search-engine brand glyph registry.
 *
 * WHY A GENERATOR
 * ---------------
 * The dropdown used emoji as engine marks (🦆, 🦁, 🔍). Emoji render
 * differently on every platform, carry no brand meaning, and look like a
 * placeholder rather than a product.
 *
 * The obvious fix is an icon font or a runtime call to an icon CDN. Both are
 * wrong here: a CDN request on every new tab would tell a third party how often
 * the user opens a tab, which is exactly the tracker this project removed in
 * 1.2.0. So the path data is vendored into the extension at build time and the
 * shipped add-on makes no icon request at all.
 *
 * Hand-copying path data is how a glyph silently becomes a scribble, so this
 * script pulls it from the Iconify API and writes the module verbatim.
 *
 * Usage:
 *   npm run generate:icons
 *
 * Re-run only when the engine registry gains an entry. The output is committed,
 * so a normal build, test run and CI job stays offline.
 *
 * SOURCES AND LICENCES
 * --------------------
 * - Simple Icons (https://simpleicons.org) — CC0 1.0 Universal.
 * - Boxicons     (https://boxicons.com)    — MIT.
 *
 * Both permit redistribution. Brand marks remain the property of their
 * respective owners and are used here only to identify the search engine a
 * user is choosing, which is nominative use.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'extension', 'icons.js');

const API = 'https://api.iconify.design';

/**
 * Engine id → icon, as `set:name`.
 *
 * Every mark is a single-colour glyph so it inherits `currentColor` and stays
 * legible on a light background, a dark one, and on top of a photo. A
 * multi-colour brand logo cannot do that.
 *
 * Engines with no published mark fall through to FALLBACK rather than getting
 * an approximated logo — drawing a brand badly is worse than not drawing it.
 */
const MAP = {
  duckduckgo: 'simple-icons:duckduckgo',
  brave: 'simple-icons:brave',
  startpage: 'simple-icons:startpage',
  ecosia: 'simple-icons:ecosia',
  ecosia_en: 'simple-icons:ecosia',
  google: 'simple-icons:google',
  bing: 'bxl:bing',
  yahoo: 'simple-icons:yahoo',
  yahoojp: 'simple-icons:yahoo',
  baidu: 'simple-icons:baidu',
  qwant: 'simple-icons:qwant',
  mojeek: 'simple-icons:mojeek',
  searx: 'simple-icons:searxng',
  perplexity: 'simple-icons:perplexity',
  kagi: 'simple-icons:kagi',
  naver: 'simple-icons:naver',
  metager: 'simple-icons:metager',
  swisscows: 'simple-icons:swisscows',
  aol: 'simple-icons:aol',
};

/** Shown for any engine without a brand mark, and for an unknown id. */
const FALLBACK = 'bxs:search';

/** Fetch one Iconify set, returning `{ name: { body, width, height } }`. */
async function fetchSet(prefix, names) {
  const url = `${API}/${prefix}.json?icons=${names.join(',')}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${prefix}: HTTP ${response.status} from ${url}`);
  }
  const data = await response.json();
  if (data.not_found?.length) {
    throw new Error(`${prefix}: not found — ${data.not_found.join(', ')}`);
  }

  const out = {};
  for (const [name, icon] of Object.entries(data.icons)) {
    out[name] = {
      body: icon.body,
      width: icon.width ?? data.width ?? 24,
      height: icon.height ?? data.height ?? 24,
    };
  }
  return out;
}

/**
 * Pull the `d` attributes out of an Iconify body.
 *
 * Iconify bodies are SVG fragments. Every icon used here is one or more plain
 * `<path>` elements, which is all `CUSTM_DOM.svg` builds — so anything else
 * must fail loudly rather than be silently dropped and ship as a blank square.
 */
function pathsFrom(body, id) {
  const shapes = body.match(/<(\w+)/g) ?? [];
  const unexpected = shapes.map((s) => s.slice(1)).filter((tag) => tag !== 'path');
  if (unexpected.length) {
    throw new Error(`${id}: unsupported SVG element(s): ${unexpected.join(', ')}`);
  }

  const paths = [...body.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]);
  if (!paths.length) throw new Error(`${id}: no path data`);
  return paths;
}

function render(glyphs) {
  const entries = Object.entries(glyphs)
    .map(
      ([ref, glyph]) =>
        `    '${ref}': {\n` +
        `      viewBox: '${glyph.viewBox}',\n` +
        `      paths: [\n` +
        glyph.paths.map((d) => `        '${d.replace(/'/g, "\\'")}',`).join('\n') +
        `\n      ],\n` +
        `    },`
    )
    .join('\n');

  const map = Object.entries(MAP)
    .map(([id, ref]) => `    ${id}: '${ref}',`)
    .join('\n');

  return `/**
 * cust*m Tab — Search engine brand glyphs
 *
 * GENERATED FILE — do not edit by hand.
 * Run \`npm run generate:icons\` (scripts/generate-icons.mjs) instead.
 *
 * Vendored on purpose: the shipped extension never requests an icon from a
 * CDN, so opening a new tab discloses nothing to anybody. See the generator
 * for the source sets and their licences.
 *
 * Attaches \`CUSTM_ICONS\`.
 */
(function (global) {
  'use strict';

  /** Icon reference -> drawable glyph. */
  const GLYPHS = Object.freeze({
${entries}
  });

  /** Search engine id -> icon reference. */
  const ENGINE_ICONS = Object.freeze({
${map}
  });

  /** Used for an engine with no published brand mark, and for unknown ids. */
  const FALLBACK = '${FALLBACK}';

  /** The glyph for a search engine id. Never returns null. */
  function forEngine(id) {
    return GLYPHS[ENGINE_ICONS[id]] || GLYPHS[FALLBACK];
  }

  /**
   * Build an inline <svg> for a search engine.
   *
   * Filled rather than stroked: these are brand glyphs, and \`currentColor\`
   * means one mark works on light, dark and photo backgrounds alike.
   */
  function engineIcon(id, options = {}) {
    const glyph = forEngine(id);
    return global.CUSTM_DOM.svg(glyph.paths, {
      size: options.size || 18,
      viewBox: glyph.viewBox,
      className: options.className || '',
      fill: true,
    });
  }

  global.CUSTM_ICONS = {
    glyphs: GLYPHS,
    engineIcons: ENGINE_ICONS,
    fallback: FALLBACK,
    forEngine,
    engineIcon,
  };
})(typeof self !== 'undefined' ? self : window);
`;
}

async function main() {
  const wanted = [...new Set([...Object.values(MAP), FALLBACK])];

  const bySet = new Map();
  for (const ref of wanted) {
    const [prefix, name] = ref.split(':');
    if (!bySet.has(prefix)) bySet.set(prefix, new Set());
    bySet.get(prefix).add(name);
  }

  const fetched = {};
  for (const [prefix, names] of bySet) {
    const icons = await fetchSet(prefix, [...names]);
    for (const [name, icon] of Object.entries(icons)) {
      fetched[`${prefix}:${name}`] = icon;
    }
  }

  // Deduplicate: several engines share a mark (Yahoo Japan, Ecosia's two
  // entries), and there is no reason to carry the same path data twice.
  const glyphs = {};
  for (const ref of wanted) {
    const icon = fetched[ref];
    glyphs[ref] = {
      viewBox: `0 0 ${icon.width} ${icon.height}`,
      paths: pathsFrom(icon.body, ref),
    };
  }

  writeFileSync(OUT, render(glyphs), 'utf8');
  console.log(
    `icons.js — ${Object.keys(glyphs).length} glyphs for ${Object.keys(MAP).length} engines`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
