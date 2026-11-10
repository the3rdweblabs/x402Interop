// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from '../../vitest.shared.ts'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['test/**/*.test.ts'],
      coverage: {
        include: ['src/lib/**/*.ts'],
        // wallet-ui.ts is DOM-only (dialog and session wiring). Unit tests run in node,
        // so it is checked by hand in a browser until a DOM test environment is added.
        exclude: ['src/**/*.astro', 'src/data/**', 'src/lib/wallet-ui.ts'],
      },
    },
  }),
)
