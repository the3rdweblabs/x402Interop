// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from '../../vitest.shared.ts'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        exclude: ['src/preview.ts'],
      },
    },
  }),
)