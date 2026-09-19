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

- **Backgrounds** - six gradient palettes, any solid colour, or a Pexels photo.
  A flat colour drives its own text contrast from WCAG relative luminance, so a
  pale choice stays readable.
- **Sunrise reveal** - the background rises and blooms as the tab opens, on the
  compositor. Suppressed under `prefers-reduced-motion`.
- **26 search engines** - five curated in the dashboard picker, all of them in
  Settings, each with an honest privacy badge.
- **Omnibox** - type `ct` in the address bar; `ct brave cats` forces an engine.
- **Bookmarks** - add, edit, delete and drag to reorder directly on the tab.
- **Private by default** - icons resolve on-device, with locally drawn letter
  tiles as the fallback. The remote icon source is opt-in.
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
├── favicon.js           CUSTM_FAVICON: on-device, monogram, or opt-in remote.
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
at evaluation time, and `dom.js` consults `CUSTM_URL` when setting `href` or
`src`. `tests/newtab.integration.test.js` asserts the order declared in
`newtab.html` actually satisfies those dependencies.

## Adding a search engine

`search-engines.js` is the single source of truth. Append one object to
`ENGINES` with a `{query}` placeholder in `url`; nothing else needs changing.
Set `privacy` honestly: `low` means that provider builds a profile.

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
