// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { afterEach, describe, expect, it } from 'vitest'

import {
  HttpOneClickClient,
  MockOneClickClient,
  ResilientOneClickClient,
  SimulatorOneClickClient,
  createOneClickClient,
} from '../src/index.js'

describe('createOneClickClient', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('defaults to mock client', () => {
    delete process.env.X402INTEROP_INTENTS_CLIENT
    delete process.env.NODE_ENV
    delete process.env.CI
    delete process.env.VITEST
    const client = createOneClickClient()
    expect(client).toBeInstanceOf(MockOneClickClient)
  })

  it('creates mock client when specified', () => {
    const client = createOneClickClient({ type: 'mock' })
    expect(client).toBeInstanceOf(MockOneClickClient)
  })

  it('creates the deterministic simulator without a network client', async () => {
    const client = createOneClickClient({ type: 'simulator', seed: 'local-simulator' })
    expect(client).toBeInstanceOf(SimulatorOneClickClient)
    const quote = await client.quote({
      originAsset: 'usdc',
      destinationAsset: 'usdc',
      amount: '50000',
      recipient: 'seller',
      refundTo: 'buyer',
      deadline: '2026-11-03T20:00:00.000Z',
      swapType: 'EXACT_OUTPUT',
    })
    expect(quote.depositAddress).toContain('1c')
    expect(quote.quoteId).toBeTruthy()
    const status = await client.status(quote.depositAddress)
    expect(status.status).toBe('PENDING_DEPOSIT')
  })

  it('reads from environment variable', () => {
    process.env.X402INTEROP_INTENTS_CLIENT = 'mock'
    const client = createOneClickClient()
    expect(client).toBeInstanceOf(MockOneClickClient)
  })

  it('is case insensitive for env var', () => {
    process.env.X402INTEROP_INTENTS_CLIENT = 'MOCK'
    const client = createOneClickClient()
    expect(client).toBeInstanceOf(MockOneClickClient)
  })

  it('throws when live client used in test environment', () => {
    process.env.NODE_ENV = 'test'
    expect(() => createOneClickClient({ type: 'live' })).toThrow(
      /forbidden in test\/CI environments/,
    )
  })

  it('throws when live client used in CI', () => {
    delete process.env.NODE_ENV
    process.env.CI = 'true'
    expect(() => createOneClickClient({ type: 'live' })).toThrow(
      /forbidden in test\/CI environments/,
    )
  })

  it('throws when live client used with vitest', () => {
    delete process.env.NODE_ENV
    delete process.env.CI
    process.env.VITEST = 'true'
    expect(() => createOneClickClient({ type: 'live' })).toThrow(
      /forbidden in test\/CI environments/,
    )
  })

  it('allows live client outside test env without api key', () => {
    delete process.env.NODE_ENV
    delete process.env.CI
    delete process.env.VITEST
    delete process.env.ONECLICK_API_KEY
    const client = createOneClickClient({ type: 'live' })
    expect(client).toBeInstanceOf(HttpOneClickClient)
  })

  it('forbids sdk and auto transports in test/CI environments', () => {
    process.env.NODE_ENV = 'test'
    expect(() => createOneClickClient({ type: 'sdk' })).toThrow(/forbidden in test\/CI/)
    expect(() => createOneClickClient({ type: 'auto' })).toThrow(/forbidden in test\/CI/)
  })

  it('builds resilient sdk+rest transports outside test env', () => {
    delete process.env.NODE_ENV
    delete process.env.CI
    delete process.env.VITEST
    delete process.env.ONECLICK_API_KEY
    expect(createOneClickClient({ type: 'sdk' })).toBeInstanceOf(ResilientOneClickClient)
    expect(createOneClickClient({ type: 'auto' })).toBeInstanceOf(ResilientOneClickClient)
  })
})
