// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { readExactAdapters } from '../src/exact.js'
import { readExposureLimits, readRateLimit } from '../src/limits.js'
import { readMarketplaceEnvironment } from '../src/marketplace.js'

describe('facilitator exact configuration', () => {
  it('loads the Sui adapter from the public RPC', async () => {
    const adapters = await readExactAdapters({
      EXACT_FAMILIES: 'sui',
      RPC_URL_SUI_MAINNET: 'https://fullnode.mainnet.sui.io:443',
    })

    expect(Object.keys(adapters)).toEqual(['sui:mainnet'])
  })

  it('leaves signer-backed families off without keys', async () => {
    const adapters = await readExactAdapters({
      EXACT_FAMILIES: 'svm,near,stellar',
      RPC_URL_SOLANA_MAINNET: 'https://api.mainnet-beta.solana.com',
      RPC_URL_NEAR_MAINNET: 'https://rpc.mainnet.fastnear.com',
      RPC_URL_STELLAR_MAINNET: 'https://soroban.example.invalid',
    })

    expect(adapters).toEqual({})
  })
})

describe('facilitator marketplace configuration', () => {
  it('parses paid fees and API keys', () => {
    const config = readMarketplaceEnvironment({
      X402INTEROP_API_KEYS: 'seller-key=seller-owner',
      MARKETPLACE_FEES_JSON: JSON.stringify({
        registration: [
          { network: 'eip155:8453', asset: 'usdc', amount: '1', treasury: '0xtreasury' },
        ],
        featured: { '30d': [], '60d': [] },
      }),
    })

    expect(config.apiKeys).toEqual({ 'seller-key': 'seller-owner' })
    expect(config.fees?.registration[0]?.treasury).toBe('0xtreasury')
    expect(config.freeListings).toBe(false)
  })

  it('supports free listings and refuses to mix them with paid fees', () => {
    expect(readMarketplaceEnvironment({ MARKETPLACE_FREE_LISTINGS: 'true' }).freeListings).toBe(
      true,
    )
    expect(() =>
      readMarketplaceEnvironment({
        MARKETPLACE_FREE_LISTINGS: 'true',
        MARKETPLACE_FEES_JSON: JSON.stringify({
          registration: [
            { network: 'eip155:8453', asset: 'usdc', amount: '1', treasury: '0xtreasury' },
          ],
          featured: { '30d': [], '60d': [] },
        }),
      }),
    ).toThrow(/not both/)
  })

  it('rejects malformed API keys and fee JSON', () => {
    expect(() => readMarketplaceEnvironment({ X402INTEROP_API_KEYS: 'invalid' })).toThrow(
      'X402INTEROP_API_KEYS',
    )
    expect(() => readMarketplaceEnvironment({ MARKETPLACE_FEES_JSON: '{' })).toThrow(
      'MARKETPLACE_FEES_JSON',
    )
    expect(() =>
      readMarketplaceEnvironment({
        MARKETPLACE_FEES_JSON: JSON.stringify({ registration: [], featured: {} }),
      }),
    ).toThrow()
  })
})

describe('facilitator safety rail configuration', () => {
  it('parses rate limits and exposure caps', () => {
    expect(readRateLimit({ RATE_LIMIT_MAX: '10', RATE_LIMIT_WINDOW_MS: '5000' })).toEqual({
      max: 10,
      windowMs: 5000,
    })
    expect(readRateLimit({})).toBeUndefined()
    expect(readRateLimit({ RATE_LIMIT_MAX: '2' })).toEqual({ max: 2, windowMs: 60_000 })
    expect(
      readExposureLimits({ EXPOSURE_LIMIT_PER_BUYER: '100', EXPOSURE_LIMIT_PER_SELLER: '200' }),
    ).toEqual({
      perBuyer: 100n,
      perSeller: 200n,
    })
    expect(readExposureLimits({ EXPOSURE_LIMIT_PER_BUYER: '100' })).toEqual({ perBuyer: 100n })
    expect(readExposureLimits({ EXPOSURE_LIMIT_PER_SELLER: '200' })).toEqual({ perSeller: 200n })
    expect(readExposureLimits({})).toBeUndefined()
  })

  it('rejects malformed safety limits', () => {
    expect(() => readRateLimit({ RATE_LIMIT_MAX: '0' })).toThrow()
    expect(() => readRateLimit({ RATE_LIMIT_MAX: 'abc' })).toThrow()
    expect(() => readExposureLimits({ EXPOSURE_LIMIT_PER_BUYER: '1.5' })).toThrow()
  })
})
