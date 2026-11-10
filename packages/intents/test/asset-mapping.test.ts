// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchTokens, mapChainToBlockchain, resolveAssetId } from '../src/asset-mapping.js'

const tokens = [
  {
    assetId: 'nep141:base-usdc.omft.near',
    blockchain: 'base',
    symbol: 'USDC',
    decimals: 6,
  },
  {
    assetId: 'nep141:sui-usdc.omft.near',
    blockchain: 'sui',
    symbol: 'USDC',
    decimals: 6,
  },
]

describe('fetchTokens', () => {
  const fetchMock = vi.fn()

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('fetches, caches, and falls back to the cache on errors', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => tokens,
      }),
    )
    const first = await fetchTokens('https://1click.example')
    expect(first).toEqual(tokens)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Second call is served from the cache: no new fetch.
    const second = await fetchTokens('https://1click.example')
    expect(second).toEqual(tokens)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A failing fetch after the TTL would return stale data, but within the
    // TTL the cache is returned without touching the network.
    vi.stubGlobal('fetch', fetchMock.mockResolvedValueOnce({ ok: false, json: async () => [] }))
    const third = await fetchTokens('https://1click.example')
    expect(third).toEqual(tokens)
  })
})

describe('resolveAssetId', () => {
  it('resolves by symbol and blockchain, case-insensitively', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => tokens }))
    expect(await resolveAssetId('usdc', 'SUI')).toBe('nep141:sui-usdc.omft.near')
    expect(await resolveAssetId('USDC', 'base')).toBe('nep141:base-usdc.omft.near')
    expect(await resolveAssetId('ETH', 'base')).toBeUndefined()
  })
})

describe('mapChainToBlockchain', () => {
  it('maps CAIP-2 ids to 1Click slugs', () => {
    expect(mapChainToBlockchain('eip155:8453')).toBe('base')
    expect(mapChainToBlockchain('eip155:1')).toBe('eth')
    expect(mapChainToBlockchain('eip155:42161')).toBe('arb')
    expect(mapChainToBlockchain('eip155:137')).toBe('pol')
    expect(mapChainToBlockchain('eip155:10')).toBe('eth')
    expect(mapChainToBlockchain('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('sol')
    expect(mapChainToBlockchain('sui:mainnet')).toBe('sui')
    expect(mapChainToBlockchain('near:mainnet')).toBe('near')
    expect(mapChainToBlockchain('tvm:-239')).toBe('ton')
    expect(mapChainToBlockchain('ton:mainnet')).toBe('ton')
    expect(mapChainToBlockchain('tron:728126428')).toBe('tron')
    expect(mapChainToBlockchain('xrpl:0')).toBe('xrp')
    expect(mapChainToBlockchain('lightning:mainnet')).toBe('btc')
    expect(mapChainToBlockchain('bip122:000000000019d6689c085ae165831e93')).toBe(
      'bip122:000000000019d6689c085ae165831e93',
    )
  })
})
