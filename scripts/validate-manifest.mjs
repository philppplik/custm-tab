#!/usr/bin/env node
/**
 * Manifest and asset-reference validator.
 *
 * Catches the failure modes that only surface after a store upload or a
 * "why is my extension blank?" session:
 *   - a manifest key pointing at a file that does not exist
 *   - an HTML page referencing a stylesheet or script that was renamed
 *   - permission creep (anything outside the reviewed allowlist)
 *   - a manifest that would load in Chrome but not Firefox
 *   - _locales message catalogues drifting out of sync
 *
 * Run: npm run validate:manifest
 * Exits non-zero with a grouped report when anything fails.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');

/** Permissions that have been reviewed and documented in TECHNICAL.md §8. */
const ALLOWED_PERMISSIONS = new Set(['storage', 'alarms', 'notifications', 'favicon']);

/** Host permissions may only ever be optional — never granted up front. */
const ALLOWED_OPTIONAL_HOSTS = new Set([
  '<all_urls>',
  'https://api.pexels.com/*',
  'file:///*',
]);

const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/** Resolve a manifest-relative path inside extension/. */
const extPath = (p) => join(EXT, p.replace(/^\/+/, ''));

/** True when `p` exists, treating a trailing `*` as a directory glob. */
function referenceExists(p) {
  const clean = p.replace(/^\/+/, '');
  if (clean.includes('*')) {
    const dir = clean.split('*')[0].replace(/\/$/, '');
    const target = dir ? join(EXT, dir) : EXT;
    return existsSync(target) && statSync(target).isDirectory();
  }
  return existsSync(join(EXT, clean));
}

// ── Load manifest ────────────────────────────────────────────────────────
const manifestPath = join(EXT, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('✗ extension/manifest.json not found');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`✗ extension/manifest.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

// ── Core fields ──────────────────────────────────────────────────────────
if (manifest.manifest_version !== 3) {
  fail(`manifest_version must be 3, got ${manifest.manifest_version}`);
}
for (const key of ['name', 'version', 'description']) {
  if (!manifest[key]) fail(`missing required manifest key: ${key}`);
}
if (manifest.version && !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
  fail(`version "${manifest.version}" is not a valid dotted-integer version`);
}
// Chrome Web Store hard limits.
if (manifest.name && manifest.name.length > 75) {
  fail(`name exceeds the 75-character store limit (${manifest.name.length})`);
}
if (manifest.description && manifest.description.length > 132) {
  fail(
    `description exceeds the 132-character store limit (${manifest.description.length})`
  );
}

// ── Permissions ──────────────────────────────────────────────────────────
for (const p of manifest.permissions ?? []) {
  if (!ALLOWED_PERMISSIONS.has(p)) {
    fail(
      `permission "${p}" is not in the reviewed allowlist. ` +
        'Add it to ALLOWED_PERMISSIONS here and document it in TECHNICAL.md §8.'
    );
  }
}
if (manifest.host_permissions?.length) {
  fail(
    'host_permissions must stay empty — use optional_host_permissions so the ' +
      `user grants access on demand (found: ${manifest.host_permissions.join(', ')})`
  );
}
for (const h of manifest.optional_host_permissions ?? []) {
  if (!ALLOWED_OPTIONAL_HOSTS.has(h)) {
    fail(`optional host permission "${h}" is not in the reviewed allowlist`);
  }
}

// ── Cross-browser background wiring ──────────────────────────────────────
const bg = manifest.background ?? {};
if (!bg.service_worker) {
  fail('background.service_worker is required for Chrome MV3');
}
if (!Array.isArray(bg.scripts) || bg.scripts.length === 0) {
  fail(
    'background.scripts is required for Firefox MV3 (it has no service worker). ' +
      'Declare both keys; each browser reads the one it supports.'
  );
}
if (
  bg.service_worker &&
  Array.isArray(bg.scripts) &&
  !bg.scripts.includes(bg.service_worker)
) {
  warn(
    `background.scripts does not include "${bg.service_worker}" — Chrome and ` +
      'Firefox would run different code'
  );
}
if (!manifest.browser_specific_settings?.gecko?.id) {
  fail('browser_specific_settings.gecko.id is required for Firefox (AMO) builds');
}

// ── File references ──────────────────────────────────────────────────────
const fileRefs = [];
const pushRef = (label, value) => {
  if (typeof value === 'string') fileRefs.push([label, value]);
};

pushRef('chrome_url_overrides.newtab', manifest.chrome_url_overrides?.newtab);
pushRef('options_ui.page', manifest.options_ui?.page);
pushRef('background.service_worker', bg.service_worker);
for (const [i, s] of (bg.scripts ?? []).entries()) pushRef(`background.scripts[${i}]`, s);
for (const [size, p] of Object.entries(manifest.icons ?? {})) pushRef(`icons.${size}`, p);
for (const [size, p] of Object.entries(manifest.action?.default_icon ?? {})) {
  pushRef(`action.default_icon.${size}`, p);
}
for (const [i, entry] of (manifest.web_accessible_resources ?? []).entries()) {
  for (const [j, r] of (entry.resources ?? []).entries()) {
    pushRef(`web_accessible_resources[${i}].resources[${j}]`, r);
  }
}

for (const [label, ref] of fileRefs) {
  if (!referenceExists(ref)) fail(`${label} → "${ref}" does not exist in extension/`);
}

// ── HTML asset references ────────────────────────────────────────────────
const htmlFiles = readdirSync(EXT).filter((f) => f.endsWith('.html'));
const ASSET_RE = /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;

for (const file of htmlFiles) {
  const html = readFileSync(join(EXT, file), 'utf8');
  for (const match of html.matchAll(ASSET_RE)) {
    const ref = match[1];
    // Skip absolute URLs, protocol-relative URLs, anchors and data URIs.
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;
    if (!existsSync(extPath(ref))) {
      fail(`${file} references "${ref}" which does not exist`);
    }
  }
}

// ── Locale catalogues ────────────────────────────────────────────────────
const localesDir = join(EXT, '_locales');
if (existsSync(localesDir)) {
  const locales = readdirSync(localesDir).filter((d) =>
    statSync(join(localesDir, d)).isDirectory()
  );
  const defaultLocale = manifest.default_locale;

  if (!defaultLocale) {
    fail('_locales/ exists but manifest.default_locale is not set');
  } else if (!locales.includes(defaultLocale)) {
    fail(`default_locale "${defaultLocale}" has no _locales/${defaultLocale} directory`);
  }

  const catalogues = new Map();
  for (const locale of locales) {
    const file = join(localesDir, locale, 'messages.json');
    if (!existsSync(file)) {
      fail(`_locales/${locale}/messages.json is missing`);
      continue;
    }
    try {
      catalogues.set(locale, JSON.parse(readFileSync(file, 'utf8')));
    } catch (e) {
      fail(`_locales/${locale}/messages.json is not valid JSON: ${e.message}`);
    }
  }

  // Every locale must carry the same keys as the default, or the UI silently
  // falls back mid-sentence.
  const base = catalogues.get(defaultLocale);
  if (base) {
    const baseKeys = new Set(Object.keys(base));
    for (const [locale, catalogue] of catalogues) {
      if (locale === defaultLocale) continue;
      const keys = new Set(Object.keys(catalogue));
      const missing = [...baseKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !baseKeys.has(k));
      if (missing.length) {
        fail(
          `_locales/${locale} is missing ${missing.length} key(s): ${missing.join(', ')}`
        );
      }
      if (extra.length) {
        warn(
          `_locales/${locale} has ${extra.length} key(s) not in ${defaultLocale}: ` +
            extra.join(', ')
        );
      }
    }
    for (const [key, entry] of Object.entries(base)) {
      if (typeof entry?.message !== 'string') {
        fail(`_locales/${defaultLocale} key "${key}" has no "message" string`);
      }
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} manifest error(s).`);
  process.exit(1);
}
console.log(
  `✓ manifest.json valid — ${fileRefs.length} file reference(s) and ` +
    `${htmlFiles.length} HTML page(s) checked` +
    (warnings.length ? ` (${warnings.length} warning(s))` : '')
);
