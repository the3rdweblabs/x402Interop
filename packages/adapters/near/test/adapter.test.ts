// SPDX-License-Identifier: GPL-3.0-or-later
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
  })
})
