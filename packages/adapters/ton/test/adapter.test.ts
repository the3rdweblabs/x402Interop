// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, X402_VERSION, type PaymentRequirements } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { tonAdapter, TON_NETWORKS } from '../src/index.js'

const requirements: PaymentRequirements = {
  scheme: tonAdapter.scheme,
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 60,
}

describe('ton adapter', () => {
  it('advertises the buyer-family scheme', () => {
    expect(tonAdapter.family).toBe('ton')
    expect(tonAdapter.scheme).toBe(SCHEME_IDS.ton)
    expect(TON_NETWORKS).toContain(tonAdapter.network)
  })

  it('refuses to verify until the chain logic exists', async () => {
    const result = await tonAdapter.verify(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('not_implemented')
  })
})
