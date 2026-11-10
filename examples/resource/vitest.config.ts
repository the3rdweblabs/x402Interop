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
      thresholds: { lines: 60, functions: 70, branches: 40, statements: 60 },
    },
  },
}
