// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { describe, expect, it } from 'vitest'

import { MemoryDiscoveryIndex, parseServiceRecord, type ServiceRecord } from '../src/index.js'

function service(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: 'price-feed',
    name: 'Token price feed',
    description: 'Spot prices',
    price: '0.05',
    networks: ['sui:mainnet'],
    asset: 'usdc',
    health: 'healthy',
    source: 'direct',
    category: 'data',
    ...overrides,
  }
}

describe('MemoryDiscoveryIndex', () => {
  it('parses a registration and rejects a bad price', () => {
    expect(parseServiceRecord(service()).id).toBe('price-feed')
    expect(() => parseServiceRecord(service({ price: 'free' }))).toThrow()
  })

  it('filters by text, network, asset, category, price, and limit', () => {
    const index = new MemoryDiscoveryIndex()
    index.register(service())
    index.register(
      service({
        id: 'other',
        name: 'Other',
        description: 'Unrelated',
        price: '1.00',
        networks: ['eip155:8453'],
        asset: 'eth',
        category: 'compute',
        health: 'unknown',
      }),
    )
    expect(index.get('missing')).toBeUndefined()
    expect(index.get('price-feed')?.name).toBe('Token price feed')
    expect(index.search().map((entry) => entry.id)).toEqual(['price-feed', 'other'])
    expect(index.search({ q: 'price' })).toHaveLength(1)
    expect(index.search({ q: 'nope' })).toHaveLength(0)
    expect(index.search({ network: 'eip155:8453' }).map((entry) => entry.id)).toEqual(['other'])
    expect(index.search({ asset: 'usdc' })).toHaveLength(1)
    expect(index.search({ category: 'data' })).toHaveLength(1)
    expect(index.search({ maxPrice: '0.10' })).toHaveLength(1)
    expect(index.search({ maxPrice: 'not-a-number' })).toHaveLength(2)
    expect(index.search({ limit: 1 })).toHaveLength(1)
  })

  it('skips entries that omit a category when one was requested', () => {
    const index = new MemoryDiscoveryIndex()
    index.register(service({ id: 'bare', category: undefined }))
    expect(index.search({ category: 'data' })).toHaveLength(0)
  })
})
