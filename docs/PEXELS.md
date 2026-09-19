# Photo backgrounds with Pexels

cust*m Tab can replace the gradient with a photo from [Pexels](https://www.pexels.com).
It needs an API key — **yours**, not one shipped with the extension.

## Getting a key

1. Sign in at [pexels.com](https://www.pexels.com) (a free account is enough).
2. Open [pexels.com/api/key](https://www.pexels.com/api/key/).
3. Describe what you are building. The key is issued instantly.
4. Copy it.

## Adding it

1. Open **cust\*m Tab settings** (toolbar icon, or the gear on the new tab).
2. Under **Background**, pick **Photo**.
3. The browser asks for permission to reach `api.pexels.com`. Allow it — the
   extension requests it at this moment rather than at install, so you are not
   granting network access for a feature you never turn on.
4. Paste your key into **Pexels API key**.
5. Press **Test key**. You should see `Key works ✓` and your remaining monthly
   request budget.
6. Press **Save**.

Optionally set a **search term** (leave it empty for the Pexels curated feed),
an **orientation**, and how often you want a **new photo**.

## Why you supply the key

Everything inside a browser extension is public. A `.crx` or `.xpi` is a ZIP
file, and anyone can open it and read every line. A key shipped with the
extension would be:

- **scraped within days** by bots that watch extension stores and GitHub,
- **shared by every install**, against a single budget of 200 requests per hour
  and 20,000 per month, and
- **revoked by Pexels**, because that pattern is exactly what their terms
  prohibit.

Your own key has your own budget, and nobody else can exhaust it.

## Where the key lives

|                              |                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored in                    | `chrome.storage.local`, on this device                                                                                                                                                  |
| Synced across devices        | **No.** It is a credential, and `storage.sync` leaves the device.                                                                                                                       |
| Included in settings exports | **No.** Redacted by `CUSTM_STORE.toExport()`.                                                                                                                                           |
| Committed to the repository  | **No.** `*.local.js` and `.env*` are gitignored, and a unit test fails the build if a key-shaped string appears anywhere in the extension source.                                       |
| Sent anywhere                | Only to `https://api.pexels.com`, in the `Authorization` header. Never in a URL, and never on a redirect — the request uses `redirect: 'error'` so the key cannot follow one elsewhere. |

If you ever need to remove it: clear the field and save, or switch the
background away from **Photo**, which also drops the host permission again.

## The rate limit, and how this respects it

Pexels allows **200 requests per hour** and **20,000 per month**, and states
plainly that working around the limit gets API access terminated.

Fetching a photo on every new tab would burn through that in an afternoon. So
one request fetches a _page_ of 24 photos, which is cached in
`chrome.storage.local` and rotated locally:

| Setting       | Network requests | What you see                                        |
| ------------- | ---------------- | --------------------------------------------------- |
| Every new tab | ~4 per day       | A different photo on each tab, from the cached page |
| Every hour    | ~24 per day      | One photo per hour, the same across tabs            |
| Every day     | ~1 per day       | One photo per day                                   |

Even the most frequent setting stays far inside the limit. When a refresh does
fail — rate limit, no connection, a rejected key — the previously cached photo
keeps being shown rather than blanking the tab.

## Attribution

Every photo shows **"Photo by &lt;name&gt; on Pexels"** in the corner, linking
to the photographer's profile and the photo page.

This is not decoration. Pexels asks API users to credit photographers, and it
is the condition for requesting a higher rate limit. It is also simply correct:
someone made the picture.

Do not remove the credit.

## Troubleshooting

| Message                                           | Meaning                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| _That does not look like a Pexels key_            | The field content is not the right shape. No request was made. Check you pasted all of it. |
| _Pexels rejected this key_                        | HTTP 401. The key is wrong, or was revoked.                                                |
| _Rate limit reached_                              | HTTP 429. Wait, or choose a less frequent refresh setting.                                 |
| _Could not reach Pexels_                          | Network error, or the host permission was declined.                                        |
| _No photos matched that search_                   | Your search term returned nothing. Try a broader one, or clear it.                         |
| _Permission to reach api.pexels.com was declined_ | Re-select **Photo** to trigger the prompt again.                                           |

If the background silently stays a gradient, the extension could not resolve a
photo and fell back rather than showing an empty tab. Open the settings page
and press **Test key** to find out why.

## Firefox

Identical, with one difference: Firefox asks for the host permission through
its own prompt. Everything else — storage, caching, attribution — behaves the
same.
