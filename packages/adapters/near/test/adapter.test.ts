// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { SCHEME_IDS, X402_VERSION, type PaymentRequirements } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { nearAdapter, NEAR_NETWORKS } from '../src/index.js'

const requirements: PaymentRequirements = {
  scheme: nearAdapter.scheme,
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 60,
}

describe('near adapter', () => {
  it('advertises the buyer-family scheme', () => {
    expect(nearAdapter.family).toBe('near')
    expect(nearAdapter.scheme).toBe(SCHEME_IDS.near)
    expect(NEAR_NETWORKS).toContain(nearAdapter.network)
  })

  it('refuses to verify until the chain logic exists', async () => {
    const result = await nearAdapter.verify(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('not_implemented')
    const settled = await nearAdapter.settle(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(settled.success).toBe(false)
    expect((await nearAdapter.verify({ x402Version: X402_VERSION, accepted: { ...requirements, scheme: 'x402interop-evm' } as any, payload: {} }, requirements)).invalidReason).toBe('scheme_mismatch')
    expect((await nearAdapter.verify({ x402Version: X402_VERSION, accepted: requirements, payload: { binding: { depositAddress: 1 } } as any }, requirements)).invalidReason).toBe('invalid_binding')
  })
})
