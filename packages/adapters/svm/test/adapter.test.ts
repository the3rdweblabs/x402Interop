// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, X402_VERSION, type PaymentRequirements } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { svmAdapter, SVM_NETWORKS } from '../src/index.js'

const requirements: PaymentRequirements = {
  scheme: svmAdapter.scheme,
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 60,
}

describe('svm adapter', () => {
  it('advertises the buyer-family scheme', () => {
    expect(svmAdapter.family).toBe('svm')
    expect(svmAdapter.scheme).toBe(SCHEME_IDS.svm)
    expect(SVM_NETWORKS).toContain(svmAdapter.network)
  })

  it('refuses to verify until the chain logic exists', async () => {
    const result = await svmAdapter.verify(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('not_implemented')
  })
})
