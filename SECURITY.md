# Security Policy

## Supported versions

Only the latest released version of cust*m Tab receives security fixes.

| Version | Supported |
| ------- | --------- |
| 1.2.x   | Yes       |
| < 1.2   | No        |

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately through GitHub Security Advisories:

> https://github.com/philppplik/custm-tab/security/advisories/new

Please include:

- the affected version and browser,
- a description of the impact,
- reproduction steps or a proof of concept,
- any suggested remediation.

You can expect an acknowledgement within 5 business days and a status update at
least every 14 days until the report is resolved. Fixes ship in the next patch
release; you will be credited in the advisory and `CHANGELOG.md` unless you ask
otherwise.

## Scope

In scope:

- Code execution or script injection through any user-supplied value
  (bookmark names and URLs, the redirect target URL, search input, the Pexels
  query, imported settings files).
- Leaking a user's stored API key, settings, or browsing data to a third party.
- Bypassing the permission model, for example reaching a host the user never
  granted.
- Weaknesses in how the extension validates or normalises URLs.

Out of scope:

- Self-XSS that requires the user to paste attacker-supplied code into their
  own settings with no other vector.
- Attacks that require a compromised browser profile or physical device access.
- Vulnerabilities in third-party services the user explicitly chose to use
  (a search engine, the Pexels API), except where cust*m Tab's own handling of
  their responses is at fault.
- Missing hardening headers on the GitHub repository itself.

## Handling of secrets

cust*m Tab ships **no** API keys, tokens, or credentials.

The optional Pexels background feature uses a key that the **user** supplies in
the extension's own settings. It is stored in `chrome.storage.local` on that
device, is never mirrored to `chrome.storage.sync`, is redacted from settings
exports, and is never transmitted anywhere except to `api.pexels.com` in the
`Authorization` header of a request the user's own configuration triggered.

If you ever find a key committed to this repository, treat it as an incident:
report it through the advisory link above so it can be revoked and rotated.

## Security controls in this repository

- **CodeQL** (`security-extended` query pack) runs on every push, every pull
  request, and weekly.
- **Dependabot** opens grouped weekly PRs for dev tooling and GitHub Actions,
  and immediate PRs for security advisories.
- **Dependency review** blocks pull requests that introduce a dependency with a
  moderate-or-higher advisory.
- **Secret scanning with push protection** is enabled on the repository.
- **`main` is protected**: no direct pushes, no force-pushes, no deletion; a
  passing CI run and an approving review are required to merge.
- **`scripts/validate-manifest.mjs`** fails CI if a manifest permission appears
  that is not on the reviewed allowlist, or if `host_permissions` is used
  instead of `optional_host_permissions`.
