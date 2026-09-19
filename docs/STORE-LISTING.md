# Chrome Web Store listing

Copy-paste answers for every field in the Chrome Web Store developer dashboard.
Kept in the repository so the listing stays in step with the code it describes.

---

## Package

Upload `dist/custm-tab-chrome-1.3.0.zip` (built by `npm run build`).

Do **not** upload the Firefox package to Chrome: it carries `background.scripts`
instead of `background.service_worker` and omits the `favicon` permission.

---

## Store listing

### Description

> Limit 16,000 characters. This is roughly 2,800.

```
Your tab. Your rules.

cust*m Tab replaces the new tab page with something you actually control: a clean dashboard with a clock, a search bar and your own bookmark tiles - or a direct redirect to any URL you like.

It collects nothing. No account, no sign-in, no analytics, no telemetry, no advertising identifier. There is no server behind this extension.

WHAT YOU GET

• Bookmark tiles you edit in place. Add, rename, delete and drag to reorder them right on the tab. Changes save instantly, with no trip through a settings page.

• 26 search engines, privacy-forward first. DuckDuckGo and Brave lead the list. Every engine carries an honest badge showing whether that provider builds a profile of you, so you can choose with your eyes open.

• Omnibox search. Type "ct" in the address bar followed by your query to search without opening a tab at all. Type "ct brave cats" to force a specific engine for one search.

• Backgrounds you choose. Six gradient palettes, any solid colour you like via a picker, a photo from Pexels, or your own picture from your disk. Pick a flat colour and the interface works out its own contrast from that colour's luminance, so a pale background gets dark text automatically instead of being forbidden.

• An interface you shape. Choose the material the whole interface is made of - glass, frosted, or solid with no blur at all, which is the fastest option on older hardware. Then decide what is even on the page: show the clock or hide it, 12-hour or 24-hour, with or without seconds, at the size, weight and typeface you want. The greeting can say the time of day with your name in it, your own headline instead, or nothing whatsoever. Turn all of it off and your tab is a search bar over a background, which is a perfectly good answer.

• Photo backgrounds on your own key. Supply a free Pexels API key, set a search term, and get a new photo every day, every hour, or on every new tab. The photographer is always credited with a link back.

• A sunrise reveal. The background rises and blooms as the tab opens. It is skipped automatically when your system asks for reduced motion.

• Or skip the dashboard entirely. Point the new tab at any URL, including a local file or another extension page.

• Opt-in sync. Mirror your preferences across devices if you want to. Your bookmarks stay on the device they belong to.

ABOUT YOUR PRIVACY

Everything is stored in your browser's own extension storage, on your device.

Four things can leave your browser, and each one only because you asked:

1. A search query goes to the engine you picked, when you press Enter. Never while you type.
2. If you turn on photo backgrounds, a request goes to Pexels using the API key you supplied. Permission to reach that host is requested at that moment and released when you turn the feature off.
3. If you explicitly switch the bookmark icon source to DuckDuckGo, the hostname of each bookmark is sent there to fetch an icon. Paths and query strings never are.
4. If you instead choose to load icons from each site directly, your browser asks each bookmarked site for its own icon. No third party is involved, but those sites do see the request.

By default, bookmark icons are resolved from your browser's own on-device cache, with locally drawn letter tiles as the fallback. Nothing is fetched from a third party.

A background picture you choose from your own disk never leaves the device either. It is re-encoded when you pick it, which discards EXIF metadata such as the GPS coordinates a phone writes into a photo.

Earlier versions requested every bookmark icon from Google on every new tab. That behaviour has been removed.

Full privacy policy: https://philppplik.github.io/custm-tab/privacy.html

OPEN SOURCE

MIT licensed, developed in the open. Every claim above can be checked against the source.

https://github.com/philppplik/custm-tab
```

### Category

Productivity / Workflow & Planning

### Language

English

---

## Graphic assets

All files are in the repository under `screenshots/`. Every one is a JPEG, so
none carries an alpha channel.

| Field              | File                                     | Size     |
| ------------------ | ---------------------------------------- | -------- |
| Screenshot 1       | `screenshots/01-dashboard-aurora.jpg`    | 1280x800 |
| Screenshot 2       | `screenshots/02-dashboard-tide.jpg`      | 1280x800 |
| Screenshot 3       | `screenshots/03-dashboard-light.jpg`     | 1280x800 |
| Screenshot 4       | `screenshots/04-settings-background.jpg` | 1280x800 |
| Screenshot 5       | `screenshots/05-settings-photo.jpg`      | 1280x800 |
| Small promo tile   | `screenshots/promo-small-440x280.jpg`    | 440x280  |
| Marquee promo tile | `screenshots/promo-marquee-1400x560.jpg` | 1400x560 |

Regenerate them with `npm run screenshots` (see `tools/preview/README.md`).

---

## URLs

| Field        | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| Official URL | Leave as **None** unless you verify the domain in Google Search Console. |
| Homepage URL | `https://philppplik.github.io/custm-tab/`                                |
| Support URL  | `https://github.com/philppplik/custm-tab/issues`                         |

---

## Privacy practices

### Single purpose description

> Limit 1,000 characters. This is roughly 640.

```
cust*m Tab has one purpose: to replace the browser's new tab page with a page the user controls.

That page is either a dashboard the user configures (a clock, a search bar using a search engine they picked, and bookmark tiles they created) or a direct redirect to a URL they entered.

Every feature serves that one purpose. The background options change how that page looks. The search engine picker decides where that page's search box sends a query. The bookmark editor manages that page's tiles. The optional sync carries those same preferences to the user's other devices.

The extension does nothing outside the new tab page. It does not read, modify or inject into any website.
```

### Permission justifications

**`storage`**

```
Stores the user's own settings so the new tab page can be rebuilt the same way each time it opens: their bookmark tiles, chosen search engine, background, theme, and redirect URL.

Without it the extension cannot remember anything the user configured, and every new tab would reset to defaults.

All data stays in the browser's extension storage on the user's device. Nothing is transmitted.
```

**`alarms`**

```
Runs one periodic check, once an hour.

Browsers can silently drop a new tab override, for example when another extension claims the new tab or after a profile reset. When that happens the user sees their old new tab page with no explanation and assumes the extension is broken.

The alarm compares the last time our new tab rendered against the last browser start, and flags a mismatch. It performs no network request and reads no browsing data.

chrome.alarms is used rather than setInterval because an MV3 service worker is terminated when idle, which would stop a timer.
```

**`notifications`**

```
Shows the result of the hourly persistence check described above, and only that.

When the check determines that the new tab override appears to have been disabled, a single notification tells the user so they can re-enable it. It is rate-limited to at most once every 24 hours.

No other notification is ever shown, and nothing is sent anywhere.
```

**`favicon`**

```
Reads bookmark tile icons from the browser's own on-device favicon cache, via chrome-extension://<id>/_favicon/.

This permission exists to protect privacy rather than to extend reach. The previous version fetched every bookmark's icon from a third-party service on every new tab, which disclosed the user's pinned sites to that service. The favicon permission resolves the same icons locally, with no network request at all.

It grants no access to browsing history. It only resolves an icon for a URL the user themselves saved as a bookmark. Where the permission is unavailable the extension falls back to locally drawn letter tiles.
```

### Are you using remote code?

**No, I am not using remote code.**

All JavaScript is contained in the package. There are no external `<script>`
tags, no remotely imported modules, no `eval()` and no `new Function()`. ESLint
enforces this: `no-eval`, `no-implied-eval`, `no-new-func` and `no-script-url`
are all set to error, and CI fails on any violation.

The extension does fetch **image data** from `api.pexels.com` when the user
enables photo backgrounds and supplies their own key. That is data, not code:
the response is JSON containing image URLs, and those images are rendered as
CSS backgrounds. No part of it is executed.

### Data usage

Tick **none** of the nine categories:

- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location
- [ ] Web history
- [ ] User activity
- [ ] Website content

> **On "Web history" specifically:** the extension stores bookmark tiles the user
> created by hand. That is user-authored configuration, not a record of pages
> visited. The extension has no `history` and no `tabs` permission, and cannot
> observe navigation.

> **On "Personally identifiable information" specifically:** Settings offers an
> optional name field, used solely to render "Good evening, &lt;name&gt;" on the
> user's own new tab. It is held in extension storage, is included in the
> opt-in browser sync the user controls, and is never transmitted to this
> project or to anybody else. Chrome's categories concern collection — meaning
> transmission off the device — and nothing here is collected.

> **On a background picture chosen from disk:** it is held in extension storage
> on the device, excluded from sync and from settings exports, and re-encoded
> through a canvas on import, which discards EXIF metadata including GPS
> coordinates. It never leaves the device.

Certify all three disclosures as **true**:

- [x] I do not sell or transfer user data to third parties, apart from the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

```
https://philppplik.github.io/custm-tab/privacy.html
```

---

## Firefox (addons.mozilla.org)

Upload `dist/custm-tab-firefox-1.2.0.zip`.

AMO asks for a data-collection declaration in the manifest rather than in a
form. It is already present:

```json
"browser_specific_settings": {
  "gecko": {
    "data_collection_permissions": { "required": ["none"] }
  }
}
```

`npm run lint:ext` runs `web-ext lint --warnings-as-errors` against the Firefox
package and must report 0 errors and 0 warnings before submission.
