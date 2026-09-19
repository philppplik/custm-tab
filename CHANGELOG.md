# Changelog

All notable changes to cust*m Tab are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-09-19

### Fixed

- **Solid light backgrounds were unreadable in three places.** Adding pale
  colours in 1.2.0 exposed elements that had only ever been styled against the
  dark gradient: the white logo vanished, bookmark labels kept a black glow that
  read as dirt under dark text, and the add tile lost its dashed outline. Each
  now has an explicit light-theme counterpart. Found by rendering the real UI
  rather than by reading the CSS.
- **The settings page contradicted its own picker.** Selecting a palette showed
  it as active while the page kept the previous background. The background is
  now previewed live as you choose it, which is also what makes picking a solid
  colour there worth doing.
- **Inline links in Settings used the browser default blue**, which clashed with
  every other colour on the page, and the Pexels hint paragraph collided with the
  Darken slider label below it.

### Added

- A landing page at <https://philppplik.github.io/custm-tab/>, built from the
  same design tokens as the extension, with the privacy policy the stores
  require at `/privacy.html`.
- `screenshots/` with five 1280x800 store screenshots and both Chrome promo
  tiles, captured from the real UI rather than drawn separately.
- `tools/preview/` - a harness that renders the actual extension pages outside
  an extension context, so store assets cannot drift from the product. Run it
  with `npm run screenshots`.
- `docs/STORE-LISTING.md` with the exact copy for every Chrome Web Store field,
  version-controlled next to the code it describes.

## [1.2.0] - 2026-09-19

### Added

- **Backgrounds you control.** Three kinds, switchable in Settings:
  - **Gradient** — the signature ambient blobs, now in six palettes (Aurora,
    Dusk, Tide, Ember, Slate, Bloom).
  - **Solid colour** — ten curated swatches plus a full colour picker. The
    interface derives its text colour from the background's WCAG relative
    luminance, so a pale colour stays readable instead of being forbidden.
  - **Photo** — a Pexels image, with a scrim and blur the user controls.
- **Pexels photo backgrounds** (`extension/pexels.js`). The user supplies their
  own API key: anything bundled into an extension is public, so a shipped key
  would be scraped, shared across every install against one 200-per-hour
  budget, and revoked. The key is stored in `storage.local`, never synced,
  redacted from exports, and sent only in the `Authorization` header of a
  request that refuses to follow redirects. Host access to `api.pexels.com` is
  requested at the moment the feature is switched on and dropped again when it
  is switched off. One request caches a page of 24 photos which is then rotated
  locally, so even "new photo every tab" touches the network about four times a
  day. A failed refresh keeps showing the cached photo rather than blanking the
  tab. Every photo carries the photographer credit Pexels asks for. See
  [docs/PEXELS.md](docs/PEXELS.md).
- **Sunrise reveal.** The background rises and blooms when a tab opens — only
  `transform` and `opacity`, so it runs on the compositor and never delays
  first paint. Suppressed automatically under `prefers-reduced-motion`, which
  the user setting cannot override.

- Repository tooling: ESLint (flat config), Prettier, Vitest with an in-memory
  `chrome.*` mock, and an `.editorconfig`.
- `scripts/validate-manifest.mjs` — fails CI when a manifest key points at a
  missing file, an HTML page references a renamed asset, a permission appears
  outside the reviewed allowlist, `host_permissions` is used instead of
  `optional_host_permissions`, the background key would not load in both
  browsers, or locale catalogues drift out of sync.
- `scripts/build.mjs` — emits per-browser packages into `dist/`, because Chrome
  and Firefox reject each other's MV3 background key. Uses a dependency-free,
  reproducible ZIP writer so packaging works identically on Windows and CI.
- GitHub Actions: `CI` (format, lint, manifest validation, tests with coverage
  on Node 20 and 22, archive integrity check, `web-ext lint`, dependency
  review), `CodeQL` with the `security-extended` query pack, and a tag-driven
  `Release` workflow that asserts the tag matches `manifest.json`.
- Dependabot for npm dev tooling and GitHub Actions, grouped weekly.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, issue forms, and a pull
  request template.

### Changed

- `optional_host_permissions` narrowed from `<all_urls>` to
  `https://api.pexels.com/*`. Nothing in the extension ever needed blanket host
  access, and store reviewers reasonably ask about it.
- `theme: auto` now defers to what the background needs, which is what keeps a
  user-picked pale colour legible. An explicit light/dark choice still wins.

- Storage is treated as untrusted: bookmarks are normalised and revalidated on
  every read, capped at 60 entries, and names clamped to 64 characters, so a
  corrupted profile or a hostile settings import cannot inject an unsafe URL.
- The UI is English throughout; clock and date follow the browser locale
  instead of a hard-coded `de-DE`.
- Keyboard focus is visible on every interactive surface, the add tile and
  engine items are real buttons, and `prefers-reduced-motion` is respected.

### Fixed

- **Firefox read every setting as its default.** The Firefox `chrome.*`
  namespace is callback-only, so `await chrome.storage.local.get(...)` resolved
  to `undefined` throughout the codebase. `extension/compat.js` now resolves
  `browser ?? chrome`.
- **Chrome 114–120 refused to load the extension.** `background.scripts`, added
  for Firefox, makes Chrome reject an MV3 extension before Chrome 121, while
  the manifest still claimed `minimum_chrome_version: 114`.
- **The theme setting did nothing on the new tab.** `theme` was persisted and
  never applied, and `auto` was never resolved against `prefers-color-scheme`,
  so the dashboard was always dark whatever the user picked.
- **A framed target that refused embedding left a blank tab.** Redirect mode
  now detects the stall and offers a direct link.
- **A redirect target that no longer validates falls back to the dashboard**
  instead of stranding the user on an empty page.
- Firefox builds no longer carry the Chrome-only `favicon` permission, which
  AMO rejects as unknown, and the manifest now declares
  `data_collection_permissions: { required: ["none"] }`, which AMO requires.

- **Firefox never ran the background logic.** The manifest declared only
  `background.service_worker`, which Firefox MV3 does not support. Added
  `background.scripts` so the event page has an entry point, and guarded the
  `importScripts()` call that exists only in a service worker — without the
  guard it threw a `ReferenceError` on Firefox and silently disabled omnibox
  search.
- **Firefox 113–127 could not honour the manifest.** `strict_min_version` was
  `113.0`, but `optional_host_permissions` only arrived in Firefox 128. Raised
  the minimum to `128.0`.
- **The Chrome Web Store would have rejected the upload.** `description` was
  133 characters against a 132-character hard limit. Shortened, and now
  enforced by `validate-manifest` and a unit test.

### Security

- **Stored XSS in the bookmark tiles and the onboarding wizard.** Bookmark
  names and URLs were interpolated into HTML strings and assigned with
  `innerHTML`, so a bookmark named `<img src=x onerror=...>` executed on the
  new-tab page — a privileged extension origin holding every setting the user
  has, and reachable through an imported settings file. All rendering now goes
  through `extension/dom.js`, which assigns text via `textContent` and refuses
  inline event attributes. `web-ext lint` reported four `UNSAFE_VAR_ASSIGNMENT`
  findings before; it now reports zero, and `--warnings-as-errors` is enforced.
- **`javascript:` and `data:` URLs were accepted as bookmarks and as the
  redirect target.** The only check was that `new URL()` did not throw, and
  both parse cleanly. `extension/url.js` now validates every URL against a
  frozen protocol allowlist and scrubs input the way the WHATWG URL parser
  does, so a tab character inside `java<TAB>script:` cannot walk past a prefix
  check either.
- **Removed the Google favicon beacon.** Every bookmark tile requested its icon
  from `google.com/s2/favicons`, handing Google the list of pinned sites and a
  signal on every new tab — from an extension whose README promises no
  tracking. Icons now resolve on-device by default, with letter tiles as the
  universal fallback and a clearly labelled opt-in for a third-party lookup.

### Removed

- The `tabs` permission. The extension only ever calls `tabs.create`, which
  does not require it; the permission additionally granted read access to every
  tab's URL and title, which the extension never used and which store reviewers
  reasonably question.

## [1.1.0] - 2026-09-19

### Added

- Live bookmark editor on the dashboard: add, edit, delete, and drag-and-drop
  reorder, persisted immediately.
- Omnibox keyword search. Type `ct` in the address bar to search with the
  configured engine; `ct brave cats` forces a specific engine.
- Optional settings sync via `chrome.storage.sync` for mode, target URL, search
  engine, and theme. Bookmarks stay local by design.

### Changed

- Dashboard logo reduced from 75px to 40px and repositioned to the top left.

## [1.0.0] - 2026-09-19

### Added

- Initial release. Manifest V3 new-tab override with two modes: a privacy-first
  dashboard (clock, greeting, search, bookmark tiles) or a redirect to a
  user-supplied URL.
- 26 search engines with privacy badges; five privacy-forward engines curated
  into the dashboard picker.
- Four-step onboarding wizard on first install.
- Hourly persistence monitor that warns when the new-tab override appears to
  have been disabled.

[Unreleased]: https://github.com/philppplik/custm-tab/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/philppplik/custm-tab/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/philppplik/custm-tab/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/philppplik/custm-tab/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/philppplik/custm-tab/releases/tag/v1.0.0
