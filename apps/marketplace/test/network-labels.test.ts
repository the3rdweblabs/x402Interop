// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { labelForNetwork } from '../src/lib/network-labels.js'
import { coverageOf } from '../src/lib/wallet.js'

describe('network labels', () => {
  it('names known networks and families', () => {
    expect(labelForNetwork('eip155:8453')).toBe('Base')
    expect(labelForNetwork('sui:mainnet')).toBe('Sui')
    expect(labelForNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('Solana')
    expect(labelForNetwork('bip122:00040fe8ec8471911baa1db1266ea15d')).toBe('Bitcoin-family')
    expect(labelForNetwork('lnbtc:abc')).toBe('Lightning')
  })

  it('falls back to the raw id for unknown networks', () => {
    expect(labelForNetwork('eip155:999999')).toBe('eip155:999999')
  })
})

describe('wallet coverage text', () => {
  it('says every EVM network when the connection covers the EVM set', () => {
    expect(coverageOf(['eip155:8453', 'eip155:1'])).toBe('Every EVM network we support (2)')
  })

  it('lists named networks for single-chain wallets', () => {
    expect(coverageOf(['sui:mainnet'])).toBe('Sui')
    expect(coverageOf(['eip155:8453', 'sui:mainnet'])).toBe('Base, Sui')
  })
})
