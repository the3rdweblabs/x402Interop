// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { listCatalogue, resolveCanaryAsset } from '../src/assets.js'

describe('resolveCanaryAsset', () => {
  it('picks the preferred stablecoin when no asset is named', () => {
    const asset = resolveCanaryAsset('eip155:8453')
    expect(asset.symbol).toBe('USDC')
    expect(asset.asset).toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
    expect(asset.intentsAssetId).toContain('base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
  })

  it('resolves by symbol, on-chain asset, and 1Click id', () => {
    const bySymbol = resolveCanaryAsset('sui:mainnet', 'usdc')
    const byOnChain = resolveCanaryAsset('sui:mainnet', bySymbol.asset)
    const byIntentId = resolveCanaryAsset('sui:mainnet', bySymbol.intentsAssetId)
    expect(byOnChain).toEqual(bySymbol)
    expect(byIntentId).toEqual(bySymbol)
  })

  it('fails closed for an unknown symbol with the known list', () => {
    expect(() => resolveCanaryAsset('eip155:8453', 'NOPE')).toThrow(/Known symbols:.*USDC/)
  })

  it('fails closed for a network with no catalogue entries', () => {
    expect(() => resolveCanaryAsset('eip155:999999', 'USDC')).toThrow(/No catalogue assets/)
  })

  it('rejects an asset that belongs to a different network', () => {
    const sui = resolveCanaryAsset('sui:mainnet', 'USDC')
    expect(() => resolveCanaryAsset('eip155:8453', sui.intentsAssetId)).toThrow(
      /belongs to sui:mainnet/,
    )
  })
})

describe('listCatalogue', () => {
  it('lists every curated asset with its 1Click id', () => {
    const lines = listCatalogue()
    expect(lines.length).toBeGreaterThan(70)
    expect(lines.some((line) => line.includes('eip155:8453') && line.includes('USDC'))).toBe(true)
  })
})
