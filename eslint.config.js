// ESLint flat config.
//
// Layers, in order:
//   1. ESLint core "recommended"
//   2. eslint-config-expo        React, react-hooks, import and Expo/React Native rules
//   3. typescript-eslint "recommended" (+ a few type-aware rules that catch real bugs)
//   4. eslint-config-prettier    turns off rules that conflict with Prettier (formatting is Prettier's job)
const { defineConfig, globalIgnores } = require('eslint/config');
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  globalIgnores(['dist/', '.expo/', 'node_modules/', 'coverage/', 'web-build/', 'tests/fixtures/']),

  js.configs.recommended,
  expoConfig,
  tseslint.configs.recommended,

  {
    // Type-aware rules (need the TypeScript program, so TS files only).
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      // `_`-prefixed names are intentionally unused
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Plain Node code: tests, scripts, tooling config.
    files: ['tests/**', 'scripts/**', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    // CommonJS tooling config and scripts legitimately use require().
    files: ['*.config.js', 'scripts/**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // Tests: node:test's describe/it return promises that the runner collects, so awaiting them is noise;
    // and the `assert.ok(x!)` / non-null style is fine in assertions.
    files: ['tests/**'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  prettier,
]);
