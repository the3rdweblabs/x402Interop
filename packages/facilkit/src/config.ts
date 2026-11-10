// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { Network } from '@x402interop/core'

export interface FacilitatorEnvironment {
  port: number
  storePath?: string
  databaseUrl?: string
  storageMode: 'file' | 'postgres'
  intentsClient: 'mock' | 'simulator' | 'live' | 'sdk' | 'auto'
  oneClickApiUrl?: string
  /** Slippage tolerance sent to 1Click, in basis points. */
  slippageBps: number
}

function basisPoints(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error(`${name} must be an integer between 0 and 10000`)
  }
  return parsed
}

export function readFacilitatorEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): FacilitatorEnvironment {
  const port = Number(env.FACILITATOR_PORT ?? 4020)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('FACILITATOR_PORT must be an integer between 1 and 65535')
  }

  const intentsClient = env.X402INTEROP_INTENTS_CLIENT ?? 'mock'
  if (!['mock', 'simulator', 'live', 'sdk', 'auto'].includes(intentsClient)) {
    throw new Error('X402INTEROP_INTENTS_CLIENT must be mock, simulator, live, sdk, or auto')
  }
  // The simulator is an in-process lifecycle double. It never calls 1Click, so
  // a partner key is only required for the transports that leave the machine.
  const liveIntents =
    intentsClient === 'live' || intentsClient === 'sdk' || intentsClient === 'auto'
  if (liveIntents && !env.ONECLICK_API_KEY) {
    throw new Error('ONECLICK_API_KEY is required when live Intents mode is enabled')
  }
  const storageMode =
    env.FACILITATOR_STORAGE ?? (env.NODE_ENV === 'production' ? 'postgres' : 'file')
  if (storageMode !== 'file' && storageMode !== 'postgres') {
    throw new Error('FACILITATOR_STORAGE must be file or postgres')
  }
  const databaseUrl = env.DATABASE_URL || undefined
  if (storageMode === 'postgres' && !databaseUrl) {
    throw new Error('DATABASE_URL is required when FACILITATOR_STORAGE=postgres')
  }
  if (env.NODE_ENV === 'production' && storageMode !== 'postgres') {
    throw new Error('Production facilitator runtime requires FACILITATOR_STORAGE=postgres')
  }

  const slippageBps = basisPoints(env.SLIPPAGE_BPS, 'SLIPPAGE_BPS', 100)

  return {
    port,
    storePath: env.FACILITATOR_STORE_PATH || undefined,
    databaseUrl,
    storageMode,
    intentsClient: intentsClient as FacilitatorEnvironment['intentsClient'],
    oneClickApiUrl: env.ONE_CLICK_API_URL || undefined,
    slippageBps,
  }
}

export type { Network }
