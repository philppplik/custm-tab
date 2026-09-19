#!/usr/bin/env node
/**
 * Package the extension for each store.
 *
 * `extension/` is the single source of truth and stays loadable unpacked in
 * both browsers. This script derives a per-browser copy because the two stores
 * reject each other's background key:
 *
 *   Chrome  — keeps `background.service_worker`, drops `background.scripts`
 *   Firefox — keeps `background.scripts`, drops `background.service_worker`
 *
 * Output: dist/<target>/ plus dist/custm-tab-<target>-<version>.zip
 * Run: npm run build
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
} from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './lib/zip.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const DIST = join(ROOT, 'dist');

/** Chrome-only permissions that AMO rejects as unknown. */
const FIREFOX_UNKNOWN_PERMISSIONS = new Set(['favicon']);

/** Never ship these into a store package. */
const EXCLUDED_NAMES = new Set(['.DS_Store', 'Thumbs.db']);
const EXCLUDED_SUFFIXES = ['.local.js', '.map'];

/** Recursively collect every shippable file under `dir`, as archive-relative paths. */
function collectFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, base));
      continue;
    }
    if (EXCLUDED_SUFFIXES.some((s) => entry.endsWith(s))) continue;
    out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

/** Produce the manifest variant a given store will accept. */
function manifestFor(target, manifest) {
  const m = structuredClone(manifest);

  if (target === 'chrome') {
    delete m.background.scripts;
    delete m.browser_specific_settings;
  } else if (target === 'firefox') {
    delete m.background.service_worker;
    delete m.minimum_chrome_version;
    // Firefox runs an event page, not a worker; `type: module` here would be
    // interpreted against the wrong environment.
    delete m.background.type;
    // `favicon` is a Chrome-only permission backing the `_favicon/` cache.
    // Leaving it in makes AMO reject the upload as an unknown permission;
    // favicon.js already falls back to locally drawn monogram tiles there.
    m.permissions = (m.permissions ?? []).filter(
      (p) => !FIREFOX_UNKNOWN_PERMISSIONS.has(p)
    );
  }
  return m;
}

function build(target, manifest, files) {
  const outDir = join(DIST, target);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const entries = [];
  for (const rel of files) {
    const data =
      rel === 'manifest.json'
        ? Buffer.from(
            JSON.stringify(manifestFor(target, manifest), null, 2) + '\n',
            'utf8'
          )
        : readFileSync(join(EXT, rel));

    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
    entries.push({ name: rel, data });
  }

  const zipName = `custm-tab-${target}-${manifest.version}.zip`;
  writeFileSync(join(DIST, zipName), createZip(entries));

  const bytes = entries.reduce((sum, e) => sum + e.data.length, 0);
  console.log(
    `✓ ${target.padEnd(7)} ${String(entries.length).padStart(3)} files, ` +
      `${(bytes / 1024).toFixed(1)} KB raw → dist/${zipName}`
  );
}

// ── Main ─────────────────────────────────────────────────────────────────
if (!existsSync(EXT)) {
  console.error('✗ extension/ not found');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
const files = collectFiles(EXT);

if (!files.includes('manifest.json')) {
  console.error('✗ extension/manifest.json missing from the file list');
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });
for (const target of ['chrome', 'firefox']) {
  build(target, manifest, files);
}
console.log(`\nBuilt cust*m Tab v${manifest.version}.`);
