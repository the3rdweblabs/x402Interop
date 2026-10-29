// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { afterEach, describe, expect, it } from 'vitest'

import { MockOneClickClient, ScaffoldOneClickClient, createOneClickClient } from '../src/index.js'

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

  it('creates scaffold client when specified', () => {
    const client = createOneClickClient({ type: 'scaffold' })
    expect(client).toBeInstanceOf(ScaffoldOneClickClient)
  })

  it('creates mock client when specified', () => {
    const client = createOneClickClient({ type: 'mock' })
    expect(client).toBeInstanceOf(MockOneClickClient)
  })

  it('reads from environment variable', () => {
    process.env.X402INTEROP_INTENTS_CLIENT = 'scaffold'
    const client = createOneClickClient()
    expect(client).toBeInstanceOf(ScaffoldOneClickClient)
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
    expect(client).toBeDefined()
  })
})
