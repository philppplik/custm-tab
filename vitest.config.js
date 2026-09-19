import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov'],
      // Explicit allowlist rather than a glob. The page controllers
      // (newtab.js, options.js, wizard.js) are bootstraps that run on load and
      // immediately touch the DOM; listing the unit-testable modules one by one
      // keeps the threshold meaningful instead of diluted by files no unit test
      // can reach. Add each new testable module here.
      include: [
        'extension/backgrounds.js',
        'extension/compat.js',
        'extension/dom.js',
        'extension/favicon.js',
        'extension/pexels.js',
        'extension/search-engines.js',
        'extension/store.js',
        'extension/url.js',
      ],
      all: true,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
