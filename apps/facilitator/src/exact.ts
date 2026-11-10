// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createExactAdaptersFromEnv, type ExactAdapter } from '@x402interop/adpt'

/**
 * The app only supplies the environment. Upstream `@x402/*` imports and
 * signer construction stay in `@x402interop/adpt`.
 */
export function readExactAdapters(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, ExactAdapter>> {
  return createExactAdaptersFromEnv(env)
}
