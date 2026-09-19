# Contributing to cust*m Tab

Thanks for your interest. This document covers everything you need to make a
change land.

## Project principles

Every change is measured against these. A patch that breaks one needs an
explicit argument in the pull request.

1. **The user decides.** The product premise is _your tab, your rules_. Prefer
   making something configurable over choosing a default for the user. Prefer a
   sensible default over a required decision.
2. **Nothing leaves the device without an explicit action.** No telemetry, no
   analytics, no accounts, no background phone-home. Network requests happen
   only because the user searched, opened a link, or turned on a feature that
   plainly needs the network.
3. **Least privilege.** No new always-on manifest permission. Host access is
   requested at the moment the user enables the feature that needs it, via
   `optional_host_permissions`.
4. **Chrome and Firefox, one source tree.** `extension/` loads unpacked in both.
   Browser differences are absorbed by `extension/compat.js`, never by
   duplicated files.
5. **No build step to run it.** The extension is plain HTML, CSS, and classic
   scripts. The Node tooling in this repo lints, tests, and packages — it never
   compiles the source.

## Getting set up

```bash
git clone https://github.com/philppplik/custm-tab.git
cd custm-tab
npm install
```

Load it in **Chrome**: open `chrome://extensions`, enable Developer mode, click
_Load unpacked_, select the `extension/` directory.

Load it in **Firefox**: open `about:debugging#/runtime/this-firefox`, click
_Load Temporary Add-on_, select `extension/manifest.json`.

There is no watch mode. Edit a file, then press the reload button on the
extension card and open a new tab.

## Everyday commands

| Command                     | What it does                                                 |
| --------------------------- | ------------------------------------------------------------ |
| `npm run verify`            | Everything CI runs. Do this before pushing.                  |
| `npm test`                  | Unit tests once.                                             |
| `npm run test:watch`        | Unit tests in watch mode.                                    |
| `npm run test:coverage`     | Tests plus coverage; fails under the configured thresholds.  |
| `npm run lint`              | ESLint over source, scripts, and tests.                      |
| `npm run lint:fix`          | ESLint with autofix.                                         |
| `npm run format`            | Prettier write.                                              |
| `npm run validate:manifest` | Manifest keys, asset references, permissions, locale parity. |
| `npm run lint:ext`          | `web-ext lint` against the built Firefox package.            |
| `npm run build`             | Per-browser packages into `dist/`.                           |

## Branching and commits

Branch from `main`. Name the branch after what it does:
`feat/background-picker`, `fix/bookmark-escaping`, `chore/bump-eslint`,
`docs/pexels-setup`.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <imperative summary>

<optional body explaining why, not what>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

`main` is protected. Everything goes through a pull request with green CI and an
approving review.

## Code style

Prettier and ESLint are the arbiters — run them rather than arguing about
spacing. Beyond that:

- **Never build DOM from an interpolated HTML string.** `innerHTML` with a
  template literal containing a user value is the bug class this project has
  already shipped once. Use `CUSTM_DOM.el()` or `textContent`.
- **Validate at the boundary.** Any URL that arrives from user input, storage,
  or an API response goes through `CUSTM_URL` before it reaches an `href`,
  `src`, or `location`.
- **Treat storage as untrusted.** A user can edit `chrome.storage` directly, and
  an imported settings file is attacker-controlled. Normalise on read.
- **Constants, not magic numbers.** Name the threshold, the interval, the limit.
- **Small files.** Roughly 200-400 lines, 800 hard maximum. Split by feature.
- **Comments explain why.** The code already says what.

## Adding a search engine

Append one object to `ENGINES` in `extension/search-engines.js`:

```js
{
  id: 'example',                                // stable, lowercase, unique
  name: 'Example',
  url: 'https://example.com/search?q={query}',  // must contain {query}
  icon: '🔎',                                   // emoji: no network request
  privacy: 'high',                              // 'high' | 'medium' | 'low'
}
```

No other file changes. `privacy` drives the badge shown in the picker; set it
honestly — `low` means the provider builds a profile.

## Adding a user-facing string

All UI text is localised. Never hard-code a visible string.

1. Add the key to `extension/_locales/en/messages.json` (the default locale).
2. Add the same key to every other locale directory. `npm run validate:manifest`
   fails on a missing key, because a partial catalogue produces a UI that
   switches language mid-sentence.
3. Reference it as `data-i18n="yourKey"` in HTML, or `CUSTM_I18N.t('yourKey')`
   in JavaScript.

## Tests

Tests live in `tests/` and run under Vitest with `happy-dom`. `tests/setup.js`
installs an in-memory `chrome.*` mock, so a test can exercise real storage reads
and writes without a browser.

Required coverage: **80% lines / functions / statements, 75% branches.**

What a good test looks like here:

- Name the behaviour: `test('rejects a javascript: bookmark URL', ...)`.
- Arrange, act, assert — in that order, visibly.
- Cover the failure path. Most of this codebase's real bugs were malformed
  input, not the happy path.
- For anything that renders user data, assert the _escaping_, not just that the
  text appears.

## Pull request checklist

- `npm run verify` passes.
- Loaded and exercised in both Chrome and Firefox.
- New behaviour has a test.
- No new manifest permission (or a clear justification).
- No secret, key, or personal data in the diff.
- Screenshots for any visual change.
- User-facing changes add a line under `## [Unreleased]` in `CHANGELOG.md`.

## Releasing

Maintainers only.

1. Bump `version` in **both** `extension/manifest.json` and `package.json`.
2. Move the `## [Unreleased]` entries into a dated version heading in
   `CHANGELOG.md`.
3. Merge to `main`.
4. Tag: `git tag v1.2.0 && git push origin v1.2.0`.

The release workflow verifies that the tag matches `manifest.json`, runs the
full check suite, builds both packages, and opens a draft GitHub release with
the archives attached.
