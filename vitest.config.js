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
      // Explicit allowlist rather than a glob. The DOM controllers
      // (newtab.js, options.js, wizard.js) are page bootstraps that run on
      // load and are covered by their own DOM tests; listing modules one by
      // one keeps the threshold meaningful instead of diluted by files that
      // no unit test can reach. Add each new testable module here.
      include: ['extension/search-engines.js', 'extension/store.js'],
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
