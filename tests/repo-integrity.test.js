import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EXTENSION_DIR, REPO_ROOT } from './helpers/load-script.js';

const manifest = JSON.parse(readFileSync(join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

/** Every file under extension/, as paths relative to it. */
function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walk(full, base)
      : [
          full
            .slice(base.length + 1)
            .split('\\')
            .join('/'),
        ];
  });
}

const extensionFiles = walk(EXTENSION_DIR);
const textFiles = extensionFiles.filter((f) => /\.(js|json|html|css|svg|md)$/.test(f));

describe('version consistency', () => {
  test('package.json and manifest.json agree', () => {
    expect(pkg.version).toBe(manifest.version);
  });

  test('the version is a valid dotted-integer store version', () => {
    expect(manifest.version).toMatch(/^\d+(\.\d+){0,3}$/);
  });

  test('CHANGELOG.md documents the released version', () => {
    const changelog = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain(`## [${manifest.version}]`);
  });
});

describe('permission hygiene', () => {
  // Chrome and Firefox both surface these to the user at install time, and a
  // store reviewer will ask about each one.
  const REVIEWED = ['storage', 'alarms', 'notifications', 'favicon'];

  test('declares no permission outside the reviewed set', () => {
    for (const permission of manifest.permissions ?? []) {
      expect(REVIEWED, `undocumented permission "${permission}"`).toContain(permission);
    }
  });

  test('does not request the broad "tabs" permission', () => {
    // tabs.create() does not need it; only reading a tab's url/title does.
    expect(manifest.permissions ?? []).not.toContain('tabs');
  });

  test('requests no up-front host access', () => {
    expect(manifest.host_permissions ?? []).toHaveLength(0);
  });
});

describe('cross-browser wiring', () => {
  test('declares a Chrome service worker', () => {
    expect(manifest.background?.service_worker).toBeTruthy();
  });

  test('declares Firefox background scripts', () => {
    // Firefox MV3 has no service worker; without this key the background
    // logic never runs there.
    expect(Array.isArray(manifest.background?.scripts)).toBe(true);
    expect(manifest.background.scripts.length).toBeGreaterThan(0);
  });

  test('both browsers end up running the same entry file', () => {
    expect(manifest.background.scripts).toContain(manifest.background.service_worker);
  });

  test('carries a Firefox add-on id', () => {
    expect(manifest.browser_specific_settings?.gecko?.id).toBeTruthy();
  });

  test('every background script exists', () => {
    for (const script of manifest.background.scripts) {
      expect(extensionFiles, `missing ${script}`).toContain(script);
    }
  });
});

describe('store metadata limits', () => {
  test('name fits the Chrome Web Store limit', () => {
    expect(manifest.name.length).toBeLessThanOrEqual(75);
  });

  test('description fits the Chrome Web Store limit', () => {
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  test('ships all four icon sizes', () => {
    for (const size of ['16', '32', '48', '128']) {
      expect(manifest.icons[size], `icon ${size}`).toBeTruthy();
      expect(extensionFiles).toContain(manifest.icons[size]);
    }
  });
});

describe('no committed credentials', () => {
  // Shape-based detection. The project ships no key of any kind, so any hit
  // here is a real finding rather than a false positive to be triaged.
  const PATTERNS = [
    [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
    [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
    [/\bsk-[A-Za-z0-9]{32,}\b/, 'OpenAI-style secret key'],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
    [
      /(?:api[_-]?key|apikey|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
      'hard-coded credential',
    ],
  ];

  test.each(textFiles)('%s contains no credential-shaped string', (file) => {
    const content = readFileSync(join(EXTENSION_DIR, file), 'utf8');
    for (const [pattern, label] of PATTERNS) {
      expect(pattern.test(content), `${file} looks like it contains a ${label}`).toBe(
        false
      );
    }
  });

  test('the Pexels API key is never a literal in the source', () => {
    for (const file of textFiles) {
      const content = readFileSync(join(EXTENSION_DIR, file), 'utf8');
      // A real Pexels key is a 56-character alphanumeric string.
      expect(/\b[A-Za-z0-9]{56}\b/.test(content), `${file}`).toBe(false);
    }
  });
});

describe('packaging hygiene', () => {
  test('no local override file is tracked in extension/', () => {
    expect(extensionFiles.filter((f) => f.endsWith('.local.js'))).toEqual([]);
  });

  test('the extension ships no runtime dependency manifest', () => {
    // A package.json inside extension/ would end up in the store package.
    expect(extensionFiles).not.toContain('package.json');
  });

  test('the shipped extension stays small', () => {
    const bytes = extensionFiles.reduce(
      (sum, f) => sum + statSync(join(EXTENSION_DIR, f)).size,
      0
    );
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });
});
