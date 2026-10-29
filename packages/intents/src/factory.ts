// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { MockOneClickClient, OneClickNotImplementedError, ScaffoldOneClickClient, type OneClickClient } from './index.js'
import { HttpOneClickClient } from './http-client.js'

export type OneClickClientType = 'mock' | 'scaffold' | 'live'

export interface CreateOneClickClientOptions {
  type?: OneClickClientType
  baseUrl?: string
  apiKey?: string
  seed?: string
}

function isTestEnvironment(): boolean {
  if (process.env.NODE_ENV === 'test') return true
  if (process.env.CI === 'true' || process.env.CI === '1') return true
  if (process.env.VITEST === 'true') return true
  return false
}

function resolveClientType(explicit?: OneClickClientType): OneClickClientType {
  if (explicit) return explicit
  const env = process.env.X402INTEROP_INTENTS_CLIENT?.toLowerCase()
  if (env === 'live' || env === 'scaffold' || env === 'mock') {
    return env
  }
  // Default to mock for safety
  return 'mock'
}

/**
 * Create a OneClick client based on environment. Defaults to mock for safety.
 * Live client is forbidden in test/CI environments.
 */
export function createOneClickClient(options: CreateOneClickClientOptions = {}): OneClickClient {
  const type = resolveClientType(options.type)

  if (type === 'live' && isTestEnvironment()) {
    throw new Error(
      'X402INTEROP_INTENTS_CLIENT=live is forbidden in test/CI environments. Use mock or scaffold.',
    )
  }

  if (type === 'live') {
    const apiKey = options.apiKey ?? process.env.ONECLICK_API_KEY
    // API key is optional for some endpoints, but better to pass if available
    return new HttpOneClickClient(options.baseUrl ?? 'https://1click.chaindefuser.com', apiKey)
  }

  if (type === 'scaffold') {
    return new ScaffoldOneClickClient(options.baseUrl ?? 'https://1click.chaindefuser.com')
  }

  // Default to mock
  return new MockOneClickClient(options.seed ?? 'x402interop-mock')
}

export { MockOneClickClient, ScaffoldOneClickClient, OneClickNotImplementedError }
export { HttpOneClickClient }
export type { OneClickClient }
