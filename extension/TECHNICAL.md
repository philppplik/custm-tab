# Technical Documentation

> Implementation reference for **cust\*m Tab**. Audience: developers contributing to
> or auditing the extension. For end-user setup, see `README.md`; for the package
> itself, see `extension/README.md`.

## 1. Architecture overview

cust*m Tab is a Manifest V3 extension with no build step and no runtime
dependencies. It overrides the new-tab page and renders one of two experiences,
selected at runtime from persisted settings.

```
chrome_url_overrides.newtab -> newtab.html
  newtab.js (controller)
    |- reads settings through store.js
    |- MODE=dashboard -> clock, search, bookmark tiles
    `- MODE=redirect  -> iframe, or window.location to the target

background.js (service worker on Chrome, event page on Firefox)
  |- onInstalled       -> open wizard.html, first run only
  |- alarms            -> hourly persistence check
  |- omnibox           -> the `ct` keyword
  `- action.onClicked  -> openOptionsPage()
```

Every page loads `shared.css` for the design tokens and reads its data through
`store.js`. No state is shared between pages except through
`chrome.storage.local`.

The modules form a deliberate dependency order, asserted by
`tests/newtab.integration.test.js` and `tests/options.markup.test.js`:

```
compat.js            defines CUSTM_API
  url.js             needs nothing; every other module needs it
    dom.js           consults CUSTM_URL before setting href/src
      icons.js       builds its glyphs with CUSTM_DOM.svg
      favicon.js     |
      appearance.js  |  normalised through by store.js on every read
      backgrounds.js |
      pexels.js
        store.js     the single schema, normalised on read
          newtab.js / options.js / wizard.js
```

## 2. Files

| File                           | Role                                                                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                | MV3 declaration. Declares both `background.service_worker` (Chrome) and `background.scripts` (Firefox); `scripts/build.mjs` strips the wrong one per target.                                                                                         |
| `compat.js`                    | **Load first on every page.** Resolves `browser ?? chrome` into `CUSTM_API`, because Firefox exposes `chrome.*` as a callback-only shim where `await` yields `undefined`. Also exposes `CUSTM_ENV` capability probes.                                |
| `url.js`                       | `CUSTM_URL`. Frozen protocol allowlist, WHATWG-equivalent input scrubbing, and the search-vs-navigate decision. Every URL passes through here.                                                                                                       |
| `dom.js`                       | `CUSTM_DOM`. Safe element construction. Text goes through `textContent`, inline `on*` attributes are dropped, URL attributes are validated.                                                                                                          |
| `icons.js`                     | `CUSTM_ICONS`. **Generated** by `scripts/generate-icons.mjs`. Vendored single-colour brand glyphs for the search engines, so the shipped add-on requests no icon from any CDN.                                                                       |
| `favicon.js`                   | `CUSTM_FAVICON`. Resolves a tile icon from the on-device cache, the site itself, a monogram, or an opt-in third-party lookup. Also detects Chrome's placeholder icon, which is served with HTTP 200 and therefore never triggers an `error` handler. |
| `appearance.js`                | `CUSTM_APPEARANCE`. Surface material, plus the visibility and typography of the clock, date and greeting. Applies as custom properties and one `data-surface` attribute, so the stylesheet keeps ownership of the design.                            |
| `backgrounds.js`               | `CUSTM_BACKGROUND`. Gradient palettes, flat colours with computed contrast, the picture layer shared by Pexels photos and the user's own image, and the sunrise reveal.                                                                              |
| `pexels.js`                    | `CUSTM_PEXELS`. Pexels API client: BYO key, on-demand host permission, page caching with local rotation.                                                                                                                                             |
| `store.js`                     | `CUSTM_STORE`. Schema defaults, normalisation on read, optional sync, export redaction.                                                                                                                                                              |
| `search-engines.js`            | Engine registry (26 engines). Also loaded into the background context for omnibox search.                                                                                                                                                            |
| `background.js`                | Service worker (Chrome) / event page (Firefox). Install wizard, persistence alarm, omnibox, toolbar action.                                                                                                                                          |
| `newtab.html/.css/.js`         | New-tab override: dashboard or redirect.                                                                                                                                                                                                             |
| `options.html/.css/.js`        | Settings: mode, URL, engine, icons, background, sync.                                                                                                                                                                                                |
| `wizard.html/.css/.js`         | First-run onboarding.                                                                                                                                                                                                                                |
| `howto.html/.css/.js`          | In-app documentation.                                                                                                                                                                                                                                |
| `shared.css`                   | Design tokens, ambient background, photo layer, sunrise keyframes.                                                                                                                                                                                   |
| `icons/`, `custmTab-logo*.svg` | Brand assets.                                                                                                                                                                                                                                        |

## 3. Storage schema

All state lives in `chrome.storage.local` (profile-scoped, survives extension
reload, not silently dropped like `localStorage`). Keys:

| Key                  | Type                                          | Default         | Notes                                                    |
| -------------------- | --------------------------------------------- | --------------- | -------------------------------------------------------- |
| `mode`               | `'dashboard' \| 'redirect'`                   | `'dashboard'`   | Selects new-tab behavior.                                |
| `targetUrl`          | `string`                                      | `''`            | Destination URL when `mode==='redirect'`.                |
| `maskUrl`            | `boolean`                                     | `true`          | If true, embed target in iframe to hide extension URL.   |
| `bookmarks`          | `Array<{name,url}>`                           | 3 demo tiles    | Dashboard bookmark tiles.                                |
| `searchEngine`       | `string` (engine id)                          | `'duckduckgo'`  | Active engine for the search bar.                        |
| `theme`              | `'auto' \| 'light' \| 'dark'`                 | `'auto'`        | Applied via `data-theme` on `<html>`.                    |
| `iconMode`           | `'local' \| 'site' \| 'monogram' \| 'remote'` | `'local'`       | Where a tile icon comes from. See §15.                   |
| `appearance`         | `object`                                      | see below       | Surface material, clock, date, greeting.                 |
| `background`         | `object`                                      | Aurora gradient | Type, palette, colour, scrim and blur.                   |
| `backgroundImage`    | `string` (data URL)                           | `''`            | The user's own picture. Never synced, never exported.    |
| `pexels`             | `object`                                      | daily landscape | Query, orientation and refresh interval.                 |
| `pexelsApiKey`       | `string`                                      | `''`            | Credential. Never synced, never exported.                |
| `pexelsCache`        | `object \| null`                              | `null`          | A page of photo URLs, rotated locally. Never synced.     |
| `sunrise`            | `boolean`                                     | `true`          | The reveal animation on page load.                       |
| `syncEnabled`        | `boolean`                                     | `false`         | Opts into mirroring the syncable subset.                 |
| `onboardingDone`     | `boolean`                                     | `false`         | Suppresses wizard on subsequent runs.                    |
| `lastSeen`           | `number` (epoch ms)                           | —               | Set by newtab on each render; used by persistence check. |
| `browserLastStartup` | `number`                                      | —               | Set on `runtime.onStartup`.                              |
| `lastNotified`       | `number`                                      | —               | Throttles persistence notifications (24h cooldown).      |

`appearance` has the shape:

```js
{
  surface: 'glass' | 'frosted' | 'solid',
  solidTone: 'dark' | 'light',            // only meaningful when solid
  clock: {
    show: boolean,
    seconds: boolean,
    format: 'auto' | '12' | '24',         // auto follows the browser locale
    size: 0.5..2.5,                        // multiplier on the responsive base
    weight: 100..800,                      // rounded to the nearest 100
    font: 'system' | 'rounded' | 'serif' | 'mono',
  },
  date: { show: boolean },
  greeting: {
    mode: 'time' | 'text' | 'none',
    name: string,                          // appended to the time-of-day line
    text: string,                          // the headline, when mode is 'text'
  },
}
```

`store.js` exposes `getAll()` (merges defaults) and `set(patch)`. Reads are
async; callers `await`.

**Storage is untrusted.** A user can edit it from DevTools, a synced value can
arrive from a machine running a newer version, and an imported settings file is
entirely attacker-controlled. `normalize()` therefore runs on every read, not
only on write, and delegates to `CUSTM_APPEARANCE`, `CUSTM_BACKGROUND` and
`CUSTM_FAVICON` for their own sub-schemas. `backgroundImage` matters most here:
it is interpolated into a CSS `url()` on a privileged extension origin, so it is
matched against an allowlist of the three raster data URLs this app writes and
discarded outright otherwise.

Three keys never leave the device, whatever the sync setting says:
`pexelsApiKey` (a credential), `pexelsCache` and `backgroundImage` (both large
enough to exhaust the 100KB `storage.sync` quota on their own). `set()`
re-checks that list on every write rather than trusting `SYNC_KEYS` to stay
correct.

## 4. Search engines

`search-engines.js` defines `ENGINES` (array of `{id, name, icon, url, privacy}`)
and a derived `TOP_IDS` list. The dashboard renders a picker from `TOP_IDS`
(5 curated, privacy-forward defaults: DuckDuckGo, Brave, Startpage, Ecosia,
Google). All 26 engines are selectable in Settings.

`privacy` is one of `high` (no profiling), `medium`, `low` (tracking). It drives
the badge in the UI and the privacy guidance copy.

To add an engine: append one object to `ENGINES` with a `{query}` placeholder in
`url`. No other file changes.

## 5. New-tab flow

```
newtab.html loads → newtab.js
  settings = await store.getAll()
  if mode === 'redirect' && targetUrl:
      if maskUrl && isEmbeddable(targetUrl): render <iframe src=targetUrl>
      else: window.location.replace(targetUrl)
  else:
      render dashboard (clock / greeting / search / bookmarks)
  store.set({ lastSeen: Date.now() })
```

Redirect masking note: some sites send `X-Frame-Options` / `CSP frame-ancestors`
which block iframe embedding. When embedding fails, the user sees the raw
target URL in the address bar instead — by design, never an error page.

## 6. Theme system

`shared.css` defines dark (default) tokens under `:root` and light overrides under
`:root[data-theme="light"]`. `applyTheme()` in each page sets/removes the
`data-theme` attribute on `<html>`. `auto` follows `prefers-color-scheme`.

## 7. Persistence monitor

Chrome can silently disable `chrome_url_overrides` (e.g. when another extension
claims the new tab, or after a profile reset). `background.js` runs an hourly
alarm that compares `lastSeen` against `browserLastStartup`. If the new tab has
not rendered within `STARTUP_GRACE_MS` (2h) since the last browser start, and a
`targetUrl` is configured, it raises a notification (24h cooldown) prompting the
user to re-open a tab. This is advisory only — it never modifies override state.

## 8. Permissions rationale

| Permission                              | Why                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `tabs`                                  | Open wizard/options as tabs; read active tab for context actions.                                                         |
| `storage`                               | Persist all settings.                                                                                                     |
| `alarms`                                | Hourly persistence check.                                                                                                 |
| `notifications`                         | Persistence warning.                                                                                                      |
| `optional_host_permissions: <all_urls>` | Only requested if the user loads a `file://` or custom origin that needs host access; not required for default operation. |

## 9. Cross-browser status

| Browser               | Status          | Notes                                                                                                                                                   |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome / Edge / Brave | Supported (MV3) | Load unpacked or via Web Store.                                                                                                                         |
| Firefox (MV3)         | Gated           | Firefox requires `extensions.manifestV3.enabled` in `about:config` for MV3. The manifest already carries `browser_specific_settings.gecko` for AMO id.  |
| Firefox (MV2)         | Not yet shipped | Would require a background _page_ instead of a service worker and dropping `browser_specific_settings`. A thin MV2 variant can be generated on request. |

## 10. Build & load

No bundler. To load:

1. `chrome://extensions` → enable Developer mode.
2. Load unpacked → select the `extension/` directory.
3. First run opens the onboarding wizard.

To repackage for a store, zip the `extension/` directory contents (not the folder
itself) and submit. No compilation step.

## 11. Bookmark editor (dashboard, live)

Bookmarks are editable directly on the dashboard — no page reload needed.

- **Add**: the `+` tile opens the modal (`openModal(-1)`).
- **Edit**: the pencil button (`.btn-edit`, top-left on hover) opens the modal
  pre-filled (`openModal(index)`).
- **Delete**: the ✕ button (`.btn-del`, top-right on hover) removes the tile.
- **Reorder**: HTML5 drag-and-drop. Each `.sc-item` is `draggable`; on `drop`
  the array is spliced and re-inserted, then persisted and re-rendered.

All mutations write through `CUSTM_STORE.set({ bookmarks })` so the change
survives reloads. Bookmarks are **never** synced (see §12).

## 12. Optional sync (`storage.sync`)

When the user enables **Sync** (Settings → "Einstellungen synchronisieren"), a
curated subset of settings mirrors to `chrome.storage.sync` so it follows the
user's Google account across machines:

| Synced                         | Not synced                                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| `mode`, `targetUrl`, `maskUrl` | `bookmarks` (device/personal)                                      |
| `searchEngine`, `theme`        | `onboardingDone`, `lastSeen`, `browserLastStartup`, `lastNotified` |

`store.set(patch)` mirrors only syncable keys when `syncEnabled` is true;
`store.pullSyncIfEnabled()` pulls synced settings into local at boot. All sync
calls are wrapped in try/catch — if `storage.sync` is unavailable or over quota,
the operation fails soft and `chrome.storage.local` remains authoritative.

## 13. Omnibox keyword search

The manifest declares `"omnibox": { "keyword": "ct" }`. Typing `ct` in the
address bar activates cust*m Tab search:

- `ct cats` → searches with the stored default engine.
- `ct brave cats` → forces the Brave engine (first token matched against engine ids).
- `onInputChanged` suggests the top 5 engines; `onInputEntered` builds the URL
  via `CUSTM_ENGINES.buildUrl` and opens it per the disposition
  (current / new foreground / new background tab).

`background.js` loads `search-engines.js` via `importScripts()` so the SW has
the same engine registry as the pages (no duplication).

## 14. Permissions rationale (addendum)

`omnibox` is required for the keyword search feature. No new runtime host
permissions are added — searches navigate to public engine URLs only.

## 15. Bookmark icons

Four sources, ordered from most private to most reliable. The default never
touches the network.

| Mode       | Where the icon comes from    | What is disclosed                              |
| ---------- | ---------------------------- | ---------------------------------------------- |
| `local`    | Chrome's `_favicon/` cache   | Nothing. The request never leaves the browser. |
| `site`     | `https://host/favicon.ico`   | A request to each bookmarked site.             |
| `monogram` | Drawn locally from the label | Nothing.                                       |
| `remote`   | `icons.duckduckgo.com`       | Each bookmark's hostname, nothing else.        |

### Why `local` needs verification

`_favicon/` answers **every** request with HTTP 200. When Chrome has no icon
cached it returns a generic placeholder rather than an error, so an `<img>`
never fires `error` and a fallback keyed on that event can never run. Before
1.3.0 this filled the grid with identical grey glyphs and looked like the
icons had simply stopped loading.

`verifyLocal(src)` samples what `_favicon/` returns for a host that provably
cannot exist — `PLACEHOLDER_PROBE` uses the `.invalid` TLD reserved by RFC 2606
— and compares an icon's bytes against it. The probe is memoised as a promise,
so a grid of twenty bookmarks issues one probe rather than twenty, and it fails
**open**: if the fetch is unavailable, as in Firefox or in a test, the icon is
kept. Blanking a tile that was fine is the worse error.

The lookup also passes `https://host/`, with the trailing slash, because
Chrome keys its favicon database on page URLs. `URL.origin` drops it, and
origin-only lookups missed — the second, independent cause of the same symptom.

## 16. Interface customisation

`appearance.js` owns everything about how the interface looks, as opposed to
what sits behind it. It writes CSS custom properties and a single
`data-surface` attribute on `<html>`; it never styles an element directly, so
the stylesheet keeps ownership of the design and the options page gets an
accurate live preview for free by calling `apply()` on its own document.

**Theme precedence**, strongest first, resolved in `newtab.js` and mirrored in
`options.js`:

1. An explicit `theme` of `light` or `dark`.
2. The surface, when it is `solid` — an opaque white panel cannot carry white
   text whatever the background is doing, so the material overrides it.
3. What the background implies: a flat colour resolves through its WCAG
   relative luminance, a picture always wants light text.

**Materials.** `glass` and `frosted` differ in more than blur radius: frosted
also raises saturation, which is what makes real frosted glass read as glass
rather than as a grey panel. `solid` disables `backdrop-filter` entirely, which
is not a downgrade — a full-viewport backdrop filter is the single most
expensive thing this page paints.

A floating menu takes `--ct-menu-bg` rather than `--ct-surface-bg`. At the
surface's own 12% white the bookmark tiles behind the engine menu stayed
legible through it, which reads as the menu opening _underneath_ them whatever
the paint order actually is.

**Stacking.** `.search-shell` creates a stacking context whenever it is
focused, because `:focus-within` applies a transform — and clicking the engine
button is exactly that. The three dashboard rows therefore declare their own
`z-index` explicitly; relying on the menu's local `z-index: 100` put it behind
every tile that followed it in document order.
