// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { TEST_PRIVATE_KEY_ENV } from './test-key.ts'

const envPath = fileURLToPath(new URL('./tests/.env', import.meta.url))

/**
 * Load only the shared test key from `tests/.env`.
 *
 * Vitest must not load the whole file: live service settings would leak into
 * every test. An explicit environment variable always wins, and an empty value
 * leaves the suites in skip mode.
 */
export function loadTestPrivateKeyFromEnvFile(): void {
  if (process.env[TEST_PRIVATE_KEY_ENV]) return
  if (!existsSync(envPath)) return

  const match = readFileSync(envPath, 'utf8').match(
    new RegExp(`^${TEST_PRIVATE_KEY_ENV}=(.*)$`, 'm'),
  )
  if (!match) return

  const value = match[1]?.trim().replace(/^(['"])(.*)\1$/, '$2')
  if (value) process.env[TEST_PRIVATE_KEY_ENV] = value
}
