// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import base from '../../vitest.shared.ts'

export default {
  ...base,
  test: {
    ...base.test,
    coverage: {
      ...base.test?.coverage,
      thresholds: { lines: 45, functions: 50, branches: 30, statements: 45 },
    },
  },
}
