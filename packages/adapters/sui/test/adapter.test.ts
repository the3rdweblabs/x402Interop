// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, X402_VERSION, type PaymentRequirements } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { suiAdapter, SUI_NETWORKS } from '../src/index.js'

const requirements: PaymentRequirements = {
  scheme: suiAdapter.scheme,
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 60,
}

describe('sui adapter', () => {
  it('advertises the buyer-family scheme', () => {
    expect(suiAdapter.family).toBe('sui')
    expect(suiAdapter.scheme).toBe(SCHEME_IDS.sui)
    expect(SUI_NETWORKS).toContain(suiAdapter.network)
  })

  it('refuses to verify until the chain logic exists', async () => {
    const result = await suiAdapter.verify(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('not_implemented')
  })
})
