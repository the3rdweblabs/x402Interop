// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  MockOneClickClient,
  OneClickNotImplementedError,
  SimulatorOneClickClient,
  type OneClickClient,
} from './index.js'
import { HttpOneClickClient } from './http-client.js'
import { ResilientOneClickClient } from './resilient.js'
import { SdkOneClickClient } from './sdk-client.js'

export type OneClickClientType = 'mock' | 'simulator' | 'live' | 'sdk' | 'auto'

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
  if (env === 'simulator' || env === 'live' || env === 'mock' || env === 'sdk' || env === 'auto') {
    return env
  }
  // Default to mock for safety
  return 'mock'
}

/**
 * Create a OneClick client. Both live transports (REST and SDK) are forbidden
 * in test/CI environments; `auto` prefers the official SDK and fails over to
 * the REST API on the first call when the SDK is not installed or errors.
 */
export function createOneClickClient(options: CreateOneClickClientOptions = {}): OneClickClient {
  const type = resolveClientType(options.type)

  if ((type === 'live' || type === 'sdk' || type === 'auto') && isTestEnvironment()) {
    throw new Error(
      `X402INTEROP_INTENTS_CLIENT=${type} is forbidden in test/CI environments. Use mock.`,
    )
  }

  if (type === 'live') {
    const apiKey = options.apiKey ?? process.env.ONECLICK_API_KEY
    return new HttpOneClickClient(
      options.baseUrl ?? process.env.ONE_CLICK_API_URL ?? 'https://1click.chaindefuser.com',
      apiKey,
    )
  }

  if (type === 'simulator') {
    return new SimulatorOneClickClient(options.seed ?? 'x402interop-simulator')
  }

  if (type === 'sdk') {
    const apiKey = options.apiKey ?? process.env.ONECLICK_API_KEY
    const baseUrl =
      options.baseUrl ?? process.env.ONE_CLICK_API_URL ?? 'https://1click.chaindefuser.com'
    const rest = new HttpOneClickClient(baseUrl, apiKey)
    const sdk = new SdkOneClickClient({
      token: apiKey,
      baseUrl,
      restClient: rest,
    })
    return new ResilientOneClickClient([sdk, rest])
  }

  if (type === 'auto') {
    const apiKey = options.apiKey ?? process.env.ONECLICK_API_KEY
    const baseUrl =
      options.baseUrl ?? process.env.ONE_CLICK_API_URL ?? 'https://1click.chaindefuser.com'
    const rest = new HttpOneClickClient(baseUrl, apiKey)
    const sdk = new SdkOneClickClient({
      token: apiKey,
      baseUrl,
      restClient: rest,
    })
    return new ResilientOneClickClient([sdk, rest])
  }

  // Default to mock
  return new MockOneClickClient(options.seed ?? 'x402interop-mock')
}

export { MockOneClickClient, OneClickNotImplementedError, SimulatorOneClickClient }
export { HttpOneClickClient }
export { SdkOneClickClient, ONE_CLICK_SDK_PACKAGE } from './sdk-client.js'
export { ResilientOneClickClient }
export type { OneClickClient }
