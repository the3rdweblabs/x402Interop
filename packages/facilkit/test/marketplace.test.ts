// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MemoryServicesCatalog,
  createMarketplaceAuthenticator,
  createUpstreamListingPaymentProcessor,
  feeOptionsFor,
  parseServiceRecord,
  slugify,
} from '../src/index.js'
import type { MarketplaceAuthRequest } from '../src/auth.js'
import type { MarketplaceFeeConfig } from '../src/fees.js'

const feeConfig: MarketplaceFeeConfig = {
  registration: [{ network: 'eip155:8453', asset: 'usdc', amount: '100', treasury: 'treasury' }],
  featured: {
    '30d': [{ network: 'eip155:8453', asset: 'usdc', amount: '10', treasury: 'treasury' }],
    '60d': [{ network: 'eip155:8453', asset: 'usdc', amount: '20', treasury: 'treasury' }],
  },
}

function service(overrides: Record<string, unknown> = {}) {
  return parseServiceRecord({
    id: 'weather-api',
    name: 'Weather API',
    description: 'Current weather',
    price: '0.01',
    networks: ['eip155:8453', 'sui:mainnet'],
    asset: 'usdc',
    owner: 'seller',
    resourceUrl: 'https://example.com/weather',
    category: 'data',
    health: 'unknown',
    ...overrides,
  })
}

describe('marketplace catalog', () => {
  it('normalizes slugs and validates service records', () => {
    expect(slugify(' Hello, World! ')).toBe('hello-world')
    expect(() => parseServiceRecord({ name: '' })).toThrow()
    expect(service().id).toBe('weather-api')
  })

  it('loads valid records, skips malformed records, and manages records', () => {
    const catalog = new MemoryServicesCatalog()
    catalog.load([service(), { invalid: true }])
    expect(catalog.snapshot()).toHaveLength(1)
    expect(catalog.get('weather-api')).toBeTruthy()
    expect(catalog.update('missing', service())).toBeUndefined()
    expect(catalog.update('weather-api', service({ description: 'Updated' }))?.description).toBe(
      'Updated',
    )
    expect(catalog.remove('weather-api')).toBe(true)
    expect(catalog.remove('missing')).toBe(false)
  })

  it('filters, paginates, and aggregates merchants', () => {
    const catalog = new MemoryServicesCatalog()
    catalog.register(service())
    catalog.register(
      service({
        id: 'news-api',
        name: 'News API',
        description: 'Latest news',
        category: 'news',
        owner: 'another-seller',
        networks: ['eip155:8453'],
        price: '2',
      }),
    )
    expect(catalog.search({ q: 'weather', network: 'sui:mainnet' }).total).toBe(1)
    expect(catalog.search({ asset: 'eth' }).total).toBe(0)
    expect(catalog.search({ category: 'missing' }).total).toBe(0)
    expect(catalog.search({ maxPrice: '1' }).total).toBe(1)
    expect(catalog.search({ limit: 1, offset: 1 }).items).toHaveLength(1)
    expect(catalog.search({ limit: 0, offset: -1 }).limit).toBe(1)
    expect(catalog.merchants()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: 'seller', count: 1 }),
        expect.objectContaining({ owner: 'another-seller', count: 1 }),
      ]),
    )
  })
})

describe('marketplace authentication', () => {
  const request: MarketplaceAuthRequest = {
    method: 'POST',
    path: '/discovery/resources',
    body: {},
    headers: {},
  }
  const originalKeys = process.env.X402INTEROP_API_KEYS

  afterEach(() => {
    if (originalKeys === undefined) delete process.env.X402INTEROP_API_KEYS
    else process.env.X402INTEROP_API_KEYS = originalKeys
  })

  it('supports API keys, bearer tokens, and wallet signatures', async () => {
    const verify = vi.fn(async () => 'wallet-owner')
    const auth = createMarketplaceAuthenticator({
      apiKeys: { key: 'api-owner' },
      walletSignatureVerifier: { verify },
    })
    await expect(
      auth.authenticate({ ...request, headers: { 'x-x402interop-api-key': 'key' } }),
    ).resolves.toEqual({ owner: 'api-owner', method: 'api_key' })
    await expect(
      auth.authenticate({ ...request, headers: { authorization: 'Bearer key' } }),
    ).resolves.toEqual({ owner: 'api-owner', method: 'api_key' })
    await expect(
      auth.authenticate({ ...request, headers: { 'x-x402interop-signature': 'sig' } }),
    ).resolves.toEqual({ owner: 'wallet-owner', method: 'wallet_signature' })
    await expect(auth.authenticate(request)).resolves.toBeUndefined()
    expect(verify).toHaveBeenCalledOnce()
  })

  it('reads valid environment API keys and rejects malformed entries', async () => {
    process.env.X402INTEROP_API_KEYS = 'env-key=env-owner'
    const auth = createMarketplaceAuthenticator()
    await expect(
      auth.authenticate({ ...request, headers: { authorization: 'Bearer env-key' } }),
    ).resolves.toMatchObject({ owner: 'env-owner' })
    process.env.X402INTEROP_API_KEYS = 'malformed'
    const malformed = createMarketplaceAuthenticator()
    await expect(
      malformed.authenticate({ ...request, headers: { authorization: 'Bearer malformed' } }),
    ).resolves.toBeUndefined()
  })
})

describe('listing fee processing', () => {
  const input = {
    paymentSignature: Buffer.from(
      JSON.stringify({ x402Version: 2, accepted: {}, payload: {} }),
    ).toString('base64'),
    paymentRequirements: feeConfig.registration[0]!,
    resource: '/discovery/resources',
    metadata: {},
  }

  it('selects configured fee durations', () => {
    expect(feeOptionsFor(feeConfig, 'registration')).toEqual(feeConfig.registration)
    expect(feeOptionsFor(feeConfig, 'featured', '60d')).toEqual(feeConfig.featured['60d'])
  })

  it('handles upstream success, rejection, and thrown failures', async () => {
    await expect(
      createUpstreamListingPaymentProcessor(async () => ({
        success: true,
        transaction: '0xtx',
        network: 'eip155:8453',
      })).settle(input),
    ).resolves.toEqual({ success: true, transaction: '0xtx' })
    await expect(
      createUpstreamListingPaymentProcessor(async () => ({
        success: false,
        errorReason: 'rejected',
        network: 'eip155:8453',
        transaction: '',
      })).settle(input),
    ).resolves.toMatchObject({ success: false, reason: 'rejected' })
    await expect(
      createUpstreamListingPaymentProcessor(async () => {
        throw new Error('upstream down')
      }).settle(input),
    ).resolves.toEqual({ success: false, reason: 'upstream down' })
  })
})
