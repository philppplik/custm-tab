# Technical Documentation

> Implementation reference for **cust*m Tab**. Audience: developers contributing to or
> auditing the extension. For end-user setup, see `README.md`.

## 1. Architecture overview

cust*m Tab is a Manifest V3 (MV3) browser extension with no build step and no
runtime dependencies. It overrides the `chrome://newtab` page and renders one of
two experiences selected at runtime from persisted settings.

```
┌──────────────────────────────────────────────────────────┐
│ chrome.url_overrides.newtab → newtab.html                  │
│                                                            │
│  newtab.js (controller)                                    │
│     ├─ reads settings via store.js                         │
│     ├─ MODE=dashboard  → render clock/search/bookmarks     │
│     └─ MODE=redirect   → iframe OR window.location to URL  │
└──────────────────────────────────────────────────────────┘

background.js (MV3 service worker)
  ├─ onInstalled → open wizard.html (first run only)
  ├─ alarms      → hourly persistence check
  └─ action.onClicked → openOptionsPage()
```

All pages share `shared.css` (design tokens) and pull data through `store.js`.
No global state is shared between pages except via `chrome.storage.local`.

## 2. Files

| File | Role |
|------|------|
| `manifest.json` | MV3 declaration. Declares `chrome_url_overrides.newtab`, `options_ui`, background SW, permissions, and `browser_specific_settings.gecko` for Firefox. |
| `background.js` | Service worker. Install-time wizard launch, persistence alarm, toolbar click → settings. |
| `store.js` | Storage abstraction over `chrome.storage.local`. Single source of schema defaults. |
| `search-engines.js` | Engine registry (26 engines). `top` subset surfaces in the dashboard picker. |
| `newtab.html/.css/.js` | New-tab override. Either dashboard or redirect. |
| `options.html/.css/.js` | Full settings page: mode toggle, URL, engine, theme. |
| `wizard.html/.css/.js` | First-run 4-step onboarding. |
| `howto.html/.css` | In-app documentation (loaded from options). |
| `shared.css` | Design system: gradient/glass tokens, page frame, themes. |
| `custmTab-logo.svg`, `custmTab-logo-bullet.svg` | Brand marks (white, gradient-bullet). |
| `icons/` | Raster PNG icons 16/32/48/128 + source. |
| `cover.png` | README hero image. |

## 3. Storage schema

All state lives in `chrome.storage.local` (profile-scoped, survives extension
reload, not silently dropped like `localStorage`). Keys:

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `mode` | `'dashboard' \| 'redirect'` | `'dashboard'` | Selects new-tab behavior. |
| `targetUrl` | `string` | `''` | Destination URL when `mode==='redirect'`. |
| `maskUrl` | `boolean` | `true` | If true, embed target in iframe to hide extension URL. |
| `bookmarks` | `Array<{name,url}>` | 3 demo tiles | Dashboard bookmark tiles. |
| `searchEngine` | `string` (engine id) | `'duckduckgo'` | Active engine for the search bar. |
| `theme` | `'auto' \| 'light' \| 'dark'` | `'auto'` | Applied via `data-theme` on `<html>`. |
| `onboardingDone` | `boolean` | `false` | Suppresses wizard on subsequent runs. |
| `lastSeen` | `number` (epoch ms) | — | Set by newtab on each render; used by persistence check. |
| `browserLastStartup` | `number` | — | Set on `runtime.onStartup`. |
| `lastNotified` | `number` | — | Throttles persistence notifications (24h cooldown). |

`store.js` exposes `getAll()` (merges defaults) and `set(patch)`. Reads are
async; callers `await`.

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

| Permission | Why |
|-----------|-----|
| `tabs` | Open wizard/options as tabs; read active tab for context actions. |
| `storage` | Persist all settings. |
| `alarms` | Hourly persistence check. |
| `notifications` | Persistence warning. |
| `optional_host_permissions: <all_urls>` | Only requested if the user loads a `file://` or custom origin that needs host access; not required for default operation. |

## 9. Cross-browser status

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome / Edge / Brave | Supported (MV3) | Load unpacked or via Web Store. |
| Firefox (MV3) | Gated | Firefox requires `extensions.manifestV3.enabled` in `about:config` for MV3. The manifest already carries `browser_specific_settings.gecko` for AMO id. |
| Firefox (MV2) | Not yet shipped | Would require a background *page* instead of a service worker and dropping `browser_specific_settings`. A thin MV2 variant can be generated on request. |

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

| Synced | Not synced |
|--------|-----------|
| `mode`, `targetUrl`, `maskUrl` | `bookmarks` (device/personal) |
| `searchEngine`, `theme` | `onboardingDone`, `lastSeen`, `browserLastStartup`, `lastNotified` |

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
