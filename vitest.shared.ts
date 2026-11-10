// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { loadTestPrivateKeyFromEnvFile } from './test-env.ts'
import { hasTestPrivateKey } from './test-key.ts'

loadTestPrivateKeyFromEnvFile()

const setupFile = fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))

// Key-dependent suites are skipped when no test key is configured. Do not
// enforce coverage thresholds for the reduced suite; CI supplies a key.
const thresholds = hasTestPrivateKey()
  ? { lines: 90, functions: 90, branches: 90, statements: 90 }
  : { lines: 0, functions: 0, branches: 0, statements: 0 }

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: [setupFile],
    // Dynamic imports in the example suites can be slow while Turbo runs the
    // workspace's test tasks in parallel.
    hookTimeout: 30_000,
    // Turbo runs each package's Vitest process in parallel. Keep the transform
    // cache package-local so concurrent runs do not race on the workspace root
    // cache (which surfaced as ENOTEMPTY from node_modules/.vitest-cache).
    fsModuleCachePath: join(process.cwd(), 'node_modules/.vitest-cache'),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      // Vitest 5 treats a pattern with no glob wildcard as a directory.
      exclude: ['src/**/cli.ts'],
      thresholds,
    },
  },
})
