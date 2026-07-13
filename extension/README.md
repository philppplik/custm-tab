# cust*m Tab

> **Your tab. Your rules.** — A custom new-tab page for Chrome (MV3), built hybrid-ready for Firefox/Brave/Edge.

cust*m Tab replaces your new tab with either a **privacy-first dashboard** (bookmarks, search, clock) or your **own URL** — your choice, configured in 30 seconds via an onboarding wizard.

## Two modes

| Mode | What it does |
|------|--------------|
| **Dashboard** (default) | Gradient startpage with live clock, greeting, search bar + engine picker, and editable bookmark tiles. |
| **Redirect** | Loads any `https://`, `http://`, `file://`, or `chrome-extension://` URL as your new tab. Optionally embedded in an iframe to keep the extension URL in the address bar. |

Switch modes anytime in Settings.

## Features

- **Privacy-first search** — 5 curated engines in the dashboard picker (DuckDuckGo, Brave, Startpage, Ecosia, Google) + 20+ more in Settings. Each shows a privacy badge (privat / mittel / tracking).
- **Onboarding wizard** — opens on first install; picks mode, bookmarks, search engine, and theme in 4 steps.
- **Persistent storage** — bookmarks & settings live in `chrome.storage.local` (profile-scoped, correct for an extension; no silent `localStorage` loss).
- **Alarm-based persistence monitor** — warns if Chrome disables the override.
- **Light / Dark / Auto theme**, applied across all pages.
- **No frameworks** — vanilla HTML/CSS/JS, total weight well under 50 KB.

## Install (development)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. A new tab opens the **onboarding wizard**

## File structure

```
extension/
├── manifest.json          # MV3 manifest (Firefox-ready via browser_specific_settings)
├── background.js          # Service worker (onboarding, persistence alarm)
├── newtab.html/css/js     # New tab override (dashboard OR redirect)
├── options.html/css/js    # Settings page (mode, URL, engine, theme)
├── wizard.html/css/js     # First-run onboarding (4 steps)
├── howto.html/css         # In-app documentation
├── search-engines.js      # Engine registry (5 top + 20+ extended)
├── store.js               # Shared storage layer + schema defaults
├── shared.css             # Design system (gradient/glass vars, page frame)
├── custmTab-logo.svg      # Brand logo (referenced by all pages)
└── icons/                 # PNG icons (16/32/48/128) + source SVG
```

> Note: icon PNGs are committed directly; the older `generate-icons.js` / `create-icons.html`
> generators referenced in earlier docs are not required for loading the extension.

## Search engines

`search-engines.js` is the single source of truth. `top` engines appear in the
dashboard dropdown; all engines are selectable in Settings. Add an entry to the
`ENGINES` array to ship a new engine — no other file needs to change.

## Cross-browser

The manifest is MV3 with `browser_specific_settings.gecko` set, so it loads in
Chrome, Edge, Brave, and (MV3-capable) Firefox. Firefox MV3 support is still
gated behind `extensions.manifestV3.enabled` in some versions; if you need broad
Firefox coverage today, ship an MV2 variant (drop `browser_specific_settings`
and the service worker to a background page).

## Stack

- **Manifest V3** — no persistent background scripts
- **No frameworks** — vanilla HTML/CSS/JS, < 50 KB
- **Permissions**: `tabs`, `storage`, `alarms`, `notifications`

## License

MIT
