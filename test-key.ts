// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createHash } from 'node:crypto'

export const TEST_PRIVATE_KEY_ENV = 'X402INTEROP_TEST_PRIVATE_KEY'

/**
 * Placeholder used only so a test module can initialise while its key-dependent
 * suite is skipped. Never sign with it in a test that actually runs.
 */
export const PLACEHOLDER_TEST_PRIVATE_KEY = `0x${'11'.repeat(32)}` as `0x${string}`

/**
 * The single unfunded EVM key shared by every test and the offline helpers.
 * The value lives in the gitignored `tests/.env`; `vitest.setup.ts` copies only
 * this variable into the test process. An absent value is allowed so suites can
 * skip; a malformed value still fails fast.
 */
export function optionalTestPrivateKey(
  env: NodeJS.ProcessEnv = process.env,
): `0x${string}` | undefined {
  const raw = env[TEST_PRIVATE_KEY_ENV]?.trim() ?? ''
  if (raw === '') return undefined
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      `${TEST_PRIVATE_KEY_ENV} must be a 32-byte 0x-prefixed test key; see tests/.env.example`,
    )
  }
  return raw as `0x${string}`
}

/** True when a valid test key is configured, so key-dependent suites can run. */
export function hasTestPrivateKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return optionalTestPrivateKey(env) !== undefined
}

/**
 * The configured key, or a harmless placeholder for module-level setup in
 * suites that will be skipped with `hasTestPrivateKey()`.
 */
export function testPrivateKeyOrPlaceholder(env: NodeJS.ProcessEnv = process.env): `0x${string}` {
  return optionalTestPrivateKey(env) ?? PLACEHOLDER_TEST_PRIVATE_KEY
}

/** Strict accessor for code paths that must not continue without a real key. */
export function requireTestPrivateKey(env: NodeJS.ProcessEnv = process.env): `0x${string}` {
  const key = optionalTestPrivateKey(env)
  if (!key) {
    throw new Error(`${TEST_PRIVATE_KEY_ENV} is not set; see tests/.env.example`)
  }
  return key
}

/** Deterministic second signer for tests that need two addresses. */
export function secondaryTestPrivateKey(env: NodeJS.ProcessEnv = process.env): `0x${string}` {
  const digest = createHash('sha256')
    .update(`${requireTestPrivateKey(env)}:secondary`)
    .digest('hex')
  return `0x${digest}`
}
