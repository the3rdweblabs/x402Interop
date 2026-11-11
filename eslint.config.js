// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/.astro/**',
      'pnpm-lock.yaml',
      'apps/interop/src/scripts/**',
      'apps/marketplace/src/scripts/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // Payment payloads and upstream SDK boundaries are intentionally
      // runtime-shaped; zod validation guards the public edges.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/interop/src/scripts/**/*.js', 'apps/marketplace/src/scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        addEventListener: 'readonly',
        cancelAnimationFrame: 'readonly',
        clearTimeout: 'readonly',
        document: 'readonly',
        getComputedStyle: 'readonly',
        HTMLElement: 'readonly',
        innerHeight: 'readonly',
        localStorage: 'readonly',
        matchMedia: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        scrollY: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    files: ['skills/x402interop/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },
  prettier,
)
