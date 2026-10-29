// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
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
    const settled = await svmAdapter.settle(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(settled.success).toBe(false)
    const bad = await svmAdapter.verify({ x402Version: X402_VERSION, accepted: { ...requirements, scheme: 'x402interop-evm' } as any, payload: {} }, requirements)
    expect(bad.invalidReason).toBe('scheme_mismatch')
    const bad2 = await svmAdapter.verify({ x402Version: X402_VERSION, accepted: requirements, payload: { binding: { depositAddress: 123 } } as any }, requirements)
    expect(bad2.invalidReason).toBe('invalid_binding')
  })
})
