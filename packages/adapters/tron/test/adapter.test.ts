// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, X402_VERSION, type PaymentRequirements } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { tronAdapter, TRON_NETWORKS } from '../src/index.js'

const requirements: PaymentRequirements = {
  scheme: tronAdapter.scheme,
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 60,
}

describe('tron adapter', () => {
  it('advertises the buyer-family scheme', () => {
    expect(tronAdapter.family).toBe('tron')
    expect(tronAdapter.scheme).toBe(SCHEME_IDS.tron)
    expect(TRON_NETWORKS).toContain(tronAdapter.network)
  })

  it('refuses to verify until the chain logic exists', async () => {
    const result = await tronAdapter.verify(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('not_implemented')
  })
})
