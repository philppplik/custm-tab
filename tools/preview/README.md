# Preview harness

Renders the **real** extension UI outside a browser-extension context, so the
store assets in `screenshots/` are pictures of what actually ships rather than
mock-ups drawn separately.

```bash
npm run screenshots
```

That serves the repository at <http://localhost:8765>. Open:

| URL                                        | Renders                             |
| ------------------------------------------ | ----------------------------------- |
| `/tools/preview/preview.html?page=newtab`  | The new tab page                    |
| `/tools/preview/preview.html?page=options` | The settings page                   |
| `/tools/preview/preview.html?page=wizard`  | The onboarding wizard               |
| `/tools/preview/promo.html?size=small`     | Chrome small promo tile, 440x280    |
| `/tools/preview/promo.html?size=marquee`   | Chrome marquee promo tile, 1400x560 |

## How it works

`preview.html` fetches the requested page from `extension/`, strips its
`<script>` tags, injects the body into itself, and then loads the same scripts
in the order the page declares. Before any of that it installs a small stub of
the browser APIs the pages touch, backed by an in-memory store.

Because the page's own HTML, CSS and JavaScript are loaded unmodified, a
screenshot cannot drift from the product: rename an element id or reorder a
script and the harness breaks in the same way the extension would.

An HTTP origin is required, which is why `server.mjs` exists. The harness
fetches extension pages at runtime, and a `file://` origin forbids that.

## Seeding settings

Pass a `state` parameter: base64 of the URI-encoded JSON you want in
`storage.local`.

```js
const state = Buffer.from(
  encodeURIComponent(
    JSON.stringify({
      bookmarks: [{ name: "GitHub", url: "https://github.com" }],
      iconMode: "monogram",
      theme: "dark",
      sunrise: false,
      background: { type: "gradient", gradient: "tide" },
    })
  )
).toString("base64");
```

Set `sunrise: false` when capturing, so the shot is the resting state rather
than a frame of the reveal animation.

## Capture settings

Chrome Web Store requirements, which the committed assets already satisfy:

- Screenshots: **1280x800**
- Small promo tile: **440x280**
- Marquee promo tile: **1400x560**
- Format: **JPEG**, or 24-bit PNG with no alpha

Capture as JPEG. A PNG screenshot normally carries an alpha channel, which the
store rejects, and stripping it afterwards is an avoidable step.

## Scope

Development only. Nothing here ships: `tools/` sits outside `extension/`, so
`scripts/build.mjs` never packages it.
