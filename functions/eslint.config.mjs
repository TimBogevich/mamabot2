// @ts-check

import globals from 'globals';

export default [
  {
    ignores: ['**/node_modules/**'],
  },
  // Base configuration: Node.js globals, ES2022
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2022,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off',
      quotes: ['warn', 'single', { avoidEscape: true }],
      semi: ['warn', 'always'],
      'comma-dangle': ['warn', 'always-multiline'],
      'no-var': 'warn',
      'prefer-const': 'warn',
    },
  },
  // CommonJS source type for .js files (root scripts, src/, scripts/)
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  // ESM source type for .mjs files and vitest test files (*.test.js)
  {
    files: ['**/*.mjs', 'src/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        vi: 'readonly',
      },
      sourceType: 'module',
    },
  },
];