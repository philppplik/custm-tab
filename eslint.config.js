import globals from 'globals';

/**
 * Flat ESLint config.
 *
 * The extension source is plain browser script (no bundler, no modules), so it
 * is linted with browser + webextension globals. Tooling under scripts/ and
 * tests/ is modern ESM running on Node.
 */
export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '*.min.js'],
  },

  // ── Extension source: classic browser scripts ──────────────────────────
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.serviceworker,
        CUSTM_ENGINES: 'readonly',
        CUSTM_STORE: 'readonly',
        CUSTM_API: 'readonly',
        CUSTM_I18N: 'readonly',
        CUSTM_BACKGROUND: 'readonly',
        CUSTM_DOM: 'readonly',
        CUSTM_URL: 'readonly',
        CUSTM_PEXELS: 'readonly',
      },
    },
    rules: {
      // ── Correctness ──
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',
      'no-return-await': 'error',

      // ── Security-adjacent: the bug classes that bit this codebase before ──
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-script-url': 'error',
      'no-new-func': 'error',

      // ── Hygiene ──
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      curly: ['error', 'multi-line'],
    },
  },

  // ── Node tooling and tests ─────────────────────────────────────────────
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.js', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
