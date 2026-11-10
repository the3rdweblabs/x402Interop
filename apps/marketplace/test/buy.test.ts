// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { quoteLinkFor } from '../src/lib/buy.js'
import type { Resource } from '../src/lib/marketplace.js'

const EVM_PAY_TO = `0x${'1'.repeat(40)}`
const SOLANA_PAY_TO = 'So11111111111111111111111111111111111111112'

const base: Resource = {
  id: 'weather',
  name: 'Weather',
  description: 'd',
  price: '0.05',
  networks: ['eip155:8453'],
  asset: 'usdc',
  owner: `eip155:8453:${EVM_PAY_TO}`,
  payTo: EVM_PAY_TO,
  resourceUrl: 'https://example.com/weather',
}

describe('quoteLinkFor', () => {
  it('uses payTo, never the CAIP-10 owner, as the seller address', () => {
    const link = quoteLinkFor(base)
    expect(link).toBe(
      `/quote?sellerNetwork=eip155%3A8453&sellerAsset=usdc&sellerAddress=${EVM_PAY_TO}&amount=50000`,
    )
    expect(link).not.toContain('eip155:8453:')
  })

  it('converts up to six decimals exactly', () => {
    expect(quoteLinkFor({ ...base, price: '1.5' })).toContain('amount=1500000')
    expect(quoteLinkFor({ ...base, price: '2' })).toContain('amount=2000000')
    expect(quoteLinkFor({ ...base, price: '0.000001' })).toContain('amount=1')
  })

  it('gives a Solana payout address a Solana network link', () => {
    const link = quoteLinkFor({
      ...base,
      owner: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${SOLANA_PAY_TO}`,
      payTo: SOLANA_PAY_TO,
      networks: ['eip155:8453', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
    })
    expect(link).toContain('sellerNetwork=solana%3A5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
    expect(link).toContain(`sellerAddress=${SOLANA_PAY_TO}`)
  })

  it('returns nothing when there is no payTo to pay', () => {
    expect(quoteLinkFor({ ...base, payTo: undefined })).toBeUndefined()
    expect(quoteLinkFor({ ...base, payTo: '' })).toBeUndefined()
  })

  it('returns nothing when no safe quote can be built', () => {
    expect(quoteLinkFor({ ...base, asset: 'eth' })).toBeUndefined()
    expect(quoteLinkFor({ ...base, price: '0.0000001' })).toBeUndefined()
    expect(quoteLinkFor({ ...base, price: '-1' })).toBeUndefined()
    expect(quoteLinkFor({ ...base, networks: ['near:mainnet'] })).toBeUndefined()
  })
})
