// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { readFacilitatorEnvironment } from '../src/config.js'

describe('facilitator environment configuration', () => {
  it('parses the facilitator runtime', () => {
    const config = readFacilitatorEnvironment({
      FACILITATOR_PORT: '4025',
      FACILITATOR_STORE_PATH: '/var/lib/x402/store.json',
      X402INTEROP_INTENTS_CLIENT: 'live',
      ONECLICK_API_KEY: 'test-key',
    })

    expect(config.port).toBe(4025)
    expect(config.intentsClient).toBe('live')
    expect(config.storePath).toBe('/var/lib/x402/store.json')
  })

  it('parses the slippage cap', () => {
    expect(readFacilitatorEnvironment({}).slippageBps).toBe(100)
    expect(readFacilitatorEnvironment({ SLIPPAGE_BPS: '250' }).slippageBps).toBe(250)
    expect(() => readFacilitatorEnvironment({ SLIPPAGE_BPS: '-1' })).toThrow(/SLIPPAGE_BPS/)
    expect(() => readFacilitatorEnvironment({ SLIPPAGE_BPS: '10001' })).toThrow(/SLIPPAGE_BPS/)
  })

  it('requires an API key for live Intents mode', () => {
    expect(() =>
      readFacilitatorEnvironment({
        X402INTEROP_INTENTS_CLIENT: 'live',
      }),
    ).toThrow('ONECLICK_API_KEY')
    expect(() =>
      readFacilitatorEnvironment({
        X402INTEROP_INTENTS_CLIENT: 'sdk',
      }),
    ).toThrow('ONECLICK_API_KEY')
    expect(() =>
      readFacilitatorEnvironment({
        X402INTEROP_INTENTS_CLIENT: 'auto',
      }),
    ).toThrow('ONECLICK_API_KEY')
  })

  it('lets the local simulator start without a 1Click API key', () => {
    expect(
      readFacilitatorEnvironment({
        X402INTEROP_INTENTS_CLIENT: 'simulator',
      }).intentsClient,
    ).toBe('simulator')
  })

  it('rejects invalid ports and modes', () => {
    expect(() => readFacilitatorEnvironment({ FACILITATOR_PORT: '0' })).toThrow(/FACILITATOR_PORT/)
    expect(() => readFacilitatorEnvironment({ FACILITATOR_PORT: 'not-a-port' })).toThrow(
      /FACILITATOR_PORT/,
    )
    expect(() => readFacilitatorEnvironment({ X402INTEROP_INTENTS_CLIENT: 'unknown' })).toThrow(
      /X402INTEROP_INTENTS_CLIENT/,
    )
  })

  it('requires PostgreSQL for explicit and production storage modes', () => {
    expect(() =>
      readFacilitatorEnvironment({
        FACILITATOR_STORAGE: 'sqlite',
      }),
    ).toThrow('FACILITATOR_STORAGE must be file or postgres')
    expect(() =>
      readFacilitatorEnvironment({
        FACILITATOR_STORAGE: 'postgres',
      }),
    ).toThrow('DATABASE_URL')
    expect(() =>
      readFacilitatorEnvironment({
        NODE_ENV: 'production',
        FACILITATOR_STORAGE: 'file',
      }),
    ).toThrow('Production facilitator runtime')
    expect(
      readFacilitatorEnvironment({
        FACILITATOR_STORAGE: 'postgres',
        DATABASE_URL: 'postgres://facilitator:test@localhost/x402',
      }).storageMode,
    ).toBe('postgres')
    expect(
      readFacilitatorEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://facilitator:test@localhost/x402',
      }).storageMode,
    ).toBe('postgres')
  })
})
