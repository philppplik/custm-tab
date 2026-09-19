# Changelog

All notable changes to cust*m Tab are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- Storage is treated as untrusted: bookmarks are normalised and revalidated on
  every read, capped at 60 entries, and names clamped to 64 characters, so a
  corrupted profile or a hostile settings import cannot inject an unsafe URL.
- The UI is English throughout; clock and date follow the browser locale
  instead of a hard-coded `de-DE`.
- Keyboard focus is visible on every interactive surface, the add tile and
  engine items are real buttons, and `prefers-reduced-motion` is respected.

### Added

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

### Fixed

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

[Unreleased]: https://github.com/philppplik/custm-tab/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/philppplik/custm-tab/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/philppplik/custm-tab/releases/tag/v1.0.0
