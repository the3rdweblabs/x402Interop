// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, X402_VERSION, type PaymentRequirements } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { lightningAdapter, LIGHTNING_NETWORKS } from '../src/index.js'

const requirements: PaymentRequirements = {
  scheme: lightningAdapter.scheme,
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 60,
}

describe('lightning adapter', () => {
  it('advertises the buyer-family scheme', () => {
    expect(lightningAdapter.family).toBe('lightning')
    expect(lightningAdapter.scheme).toBe(SCHEME_IDS.lightning)
    expect(LIGHTNING_NETWORKS).toContain(lightningAdapter.network)
  })

  it('refuses to verify until the chain logic exists', async () => {
    const result = await lightningAdapter.verify(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('not_implemented')
  })
})
