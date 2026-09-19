# cust*m Tab

> **Your tab. Your rules.** A new-tab page for Chrome and Firefox, from one
> Manifest V3 source tree.

cust*m Tab replaces the new tab with either a **dashboard you configure**
(bookmarks, search, clock) or **a URL of your own**. Four-step wizard on first
run.

This is the package that ships. For the project overview see the
[repository README](../README.md); for architecture see
[TECHNICAL.md](TECHNICAL.md).

## Two modes

| Mode                    | What it does                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard** (default) | Clock, greeting, search bar with an engine picker, and editable bookmark tiles over a background you choose.                                               |
| **Redirect**            | Loads any `https:`, `http:`, `file:`, `chrome-extension:` or `moz-extension:` URL as your new tab, optionally inside a frame so the address bar stays put. |

Switch at any time in Settings.

## Features

- **Backgrounds** - six gradient palettes, any solid colour, a Pexels photo, or
  your own picture from disk. A flat colour drives its own text contrast from
  WCAG relative luminance, so a pale choice stays readable.
- **Interface material** - glass, frosted, or solid. Solid turns off every
  backdrop filter, which is the fastest option on older hardware, and picks its
  own light or dark tone.
- **A clock and greeting you own** - shown or hidden, 12- or 24-hour, optional
  seconds, size, weight and typeface. The greeting is the time of day with your
  name, your own headline instead, or nothing at all.
- **Sunrise reveal** - the background rises and blooms as the tab opens, on the
  compositor. Suppressed under `prefers-reduced-motion`.
- **26 search engines** - five curated in the dashboard picker, all of them in
  Settings, each with an honest privacy badge and a vendored brand mark.
- **Omnibox** - type `ct` in the address bar; `ct brave cats` forces an engine.
- **Bookmarks** - add, edit, delete and drag to reorder directly on the tab.
- **Private by default** - icons resolve on-device, with locally drawn letter
  tiles as the fallback. Every source that touches the network is opt-in, and
  says what it discloses and to whom.
- **Opt-in sync** - preferences only. Bookmarks and the Pexels key never leave
  the device.
- **Persistence monitor** - an hourly alarm warns if the browser silently drops
  the new-tab override.
- **No frameworks, no build step** - vanilla HTML, CSS and JavaScript.

## Install for development

**Chrome, Edge, Brave** - open `chrome://extensions`, enable Developer mode,
choose _Load unpacked_, select this `extension/` folder.

**Firefox** - open `about:debugging#/runtime/this-firefox`, choose _Load
Temporary Add-on_, select `manifest.json` in this folder.

For store packages run `npm run build` from the repository root; it emits a
per-browser build into `dist/`.

## File structure

```
extension/
├── manifest.json        MV3. Declares both background keys, one per browser.
├── compat.js            CUSTM_API: browser ?? chrome. Load first on every page.
├── url.js               CUSTM_URL: protocol allowlist and normalisation.
├── dom.js               CUSTM_DOM: safe element construction, never innerHTML.
├── icons.js             CUSTM_ICONS: vendored brand glyphs. GENERATED.
├── favicon.js           CUSTM_FAVICON: on-device, site, monogram, or remote.
├── appearance.js        CUSTM_APPEARANCE: surface material, clock, greeting.
├── backgrounds.js       CUSTM_BACKGROUND: palettes, contrast, sunrise reveal.
├── pexels.js            CUSTM_PEXELS: BYO-key client with local page caching.
├── search-engines.js    Engine registry, also loaded by the background context.
├── store.js             CUSTM_STORE: schema, normalisation, optional sync.
├── background.js        Service worker (Chrome) / event page (Firefox).
├── newtab.html/css/js   New tab override: dashboard or redirect.
├── options.html/css/js  Settings.
├── wizard.html/css/js   First-run onboarding.
├── howto.html/css/js    In-app documentation.
├── shared.css           Design tokens, ambient background, sunrise keyframes.
├── custmTab-logo.svg    Brand mark.
└── icons/               16/32/48/128 PNG plus the source SVG.
```

**Load order matters.** `compat.js` defines `CUSTM_API`, which `store.js` reads
at evaluation time; `dom.js` consults `CUSTM_URL` when setting `href` or `src`;
`icons.js` calls `CUSTM_DOM.svg`; and `store.js` normalises through
`CUSTM_APPEARANCE`, `CUSTM_BACKGROUND` and `CUSTM_FAVICON` on every read.
`tests/newtab.integration.test.js` and `tests/options.markup.test.js` assert the
declared order actually satisfies those dependencies.

## Adding a search engine

`search-engines.js` is the single source of truth. Append one object to
`ENGINES` with a `{query}` placeholder in `url`; nothing else needs changing.
Set `privacy` honestly: `low` means that provider builds a profile.

To give it a brand mark, add the engine id to `MAP` in
`scripts/generate-icons.mjs` and run `npm run generate:icons`. Engines with no
published mark fall through to a neutral glyph on purpose — drawing a brand
badly is worse than not drawing it.

## Why the icons are vendored

`icons.js` is generated and committed. Requesting glyphs from an icon CDN at
runtime would tell that CDN how often you open a tab, which is exactly the
Google favicon beacon removed in 1.2.0 wearing a different hat. The generator
runs once, offline; the shipped add-on requests no icon from anybody.

## Cross-browser

One source tree, two targets. The differences are absorbed rather than
duplicated:

| Difference                                             | How it is handled                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Firefox `chrome.*` is callback-only                    | `compat.js` resolves `browser ?? chrome`, so `await` works in both.                 |
| Firefox MV3 has no service worker                      | The manifest declares `background.scripts` too; `build.mjs` keeps one per target.   |
| `importScripts` does not exist on a Firefox event page | Guarded in `background.js`; `background.scripts` loads the registry there instead.  |
| `favicon` is a Chrome-only permission                  | `build.mjs` strips it from the Firefox package, which falls back to monogram tiles. |
| AMO requires a data-collection declaration             | `browser_specific_settings.gecko.data_collection_permissions` is set to `["none"]`. |

Minimum versions: **Chrome 121** (promise-returning APIs, and `background.scripts`
is rejected before it) and **Firefox 142** (`data_collection_permissions`).

## Permissions

| Permission                             | Why                                                                   |
| -------------------------------------- | --------------------------------------------------------------------- |
| `storage`                              | Persist settings and bookmarks on the device.                         |
| `alarms`                               | Hourly persistence check.                                             |
| `notifications`                        | Report the result of that check.                                      |
| `favicon` (Chrome only)                | Resolve bookmark icons locally instead of via a third party.          |
| `api.pexels.com` (optional, on demand) | Requested when photo backgrounds are enabled, released when disabled. |

There are no `host_permissions`. `npm run validate:manifest` fails the build if
any appear, or if a permission outside this table is added.

## License

MIT
