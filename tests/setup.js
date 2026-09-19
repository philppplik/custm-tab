/**
 * Vitest global setup.
 *
 * Installs an in-memory `chrome.*` mock that behaves like the real extension
 * APIs closely enough that production code runs unmodified: storage areas hold
 * real state, reads return only the requested keys, and every method is a spy
 * so tests can assert on calls.
 *
 * A fresh mock is installed before every test.
 */
import { vi, beforeEach } from 'vitest';

/** Build one storage area (`local`, `sync`, `session`) backed by a Map. */
function createStorageArea() {
  const data = new Map();

  return {
    /**
     * Mirrors chrome.storage: a string, an array, an object of defaults, or
     * null/undefined for everything.
     */
    get: vi.fn(async (keys) => {
      if (keys === null || keys === undefined) {
        return Object.fromEntries(data);
      }
      if (typeof keys === 'string') {
        return data.has(keys) ? { [keys]: data.get(keys) } : {};
      }
      if (Array.isArray(keys)) {
        const out = {};
        for (const key of keys) {
          if (data.has(key)) out[key] = data.get(key);
        }
        return out;
      }
      const out = {};
      for (const [key, fallback] of Object.entries(keys)) {
        out[key] = data.has(key) ? data.get(key) : fallback;
      }
      return out;
    }),

    set: vi.fn(async (patch) => {
      for (const [key, value] of Object.entries(patch)) {
        // Real storage round-trips through structured clone; emulate that so a
        // test cannot accidentally pass by sharing an object reference.
        data.set(key, structuredClone(value));
      }
    }),

    remove: vi.fn(async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
    }),

    clear: vi.fn(async () => data.clear()),

    // Test-only escape hatches.
    __data: data,
    __seed: (obj) => {
      for (const [k, v] of Object.entries(obj)) data.set(k, structuredClone(v));
    },
  };
}

/** Minimal event emitter matching the chrome.events.Event shape. */
function createEvent() {
  const listeners = new Set();
  return {
    addListener: vi.fn((fn) => listeners.add(fn)),
    removeListener: vi.fn((fn) => listeners.delete(fn)),
    hasListener: vi.fn((fn) => listeners.has(fn)),
    /** Test-only: invoke every registered listener. */
    __emit: (...args) => [...listeners].map((fn) => fn(...args)),
    __listeners: listeners,
  };
}

export function createChromeMock() {
  return {
    runtime: {
      id: 'custm-tab-test',
      lastError: undefined,
      getURL: vi.fn(
        (path) => `chrome-extension://custm-tab-test/${String(path).replace(/^\//, '')}`
      ),
      openOptionsPage: vi.fn(async () => {}),
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onMessage: createEvent(),
    },

    storage: {
      local: createStorageArea(),
      sync: createStorageArea(),
      session: createStorageArea(),
      onChanged: createEvent(),
    },

    tabs: {
      create: vi.fn(async (props) => ({ id: 1, ...props })),
      update: vi.fn(async (props) => ({ id: 1, ...props })),
    },

    alarms: {
      create: vi.fn(async () => {}),
      clear: vi.fn(async () => true),
      onAlarm: createEvent(),
    },

    notifications: {
      create: vi.fn(async (id) => id),
      clear: vi.fn(async () => true),
      onClicked: createEvent(),
    },

    permissions: {
      contains: vi.fn(async () => false),
      request: vi.fn(async () => true),
      remove: vi.fn(async () => true),
    },

    omnibox: {
      setDefaultSuggestion: vi.fn(),
      onInputChanged: createEvent(),
      onInputEntered: createEvent(),
    },

    extension: {
      isAllowedFileSchemeAccess: vi.fn(async () => false),
    },

    i18n: {
      // Default behaviour: echo the key, so an un-translated string shows up in
      // an assertion instead of silently becoming ''.
      getMessage: vi.fn((key, substitutions) =>
        substitutions?.length ? `${key}:${[].concat(substitutions).join(',')}` : key
      ),
      getUILanguage: vi.fn(() => 'en-US'),
    },

    action: {
      onClicked: createEvent(),
    },
  };
}

/** Install a fresh mock on the global object and return it. */
export function resetChromeMock() {
  const mock = createChromeMock();
  globalThis.chrome = mock;
  // Firefox exposes the same surface under `browser`; compat.js prefers it.
  // Tests that exercise the Firefox path assign `globalThis.browser` explicitly.
  delete globalThis.browser;
  return mock;
}

beforeEach(() => {
  resetChromeMock();
});
