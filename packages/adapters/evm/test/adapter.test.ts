// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, X402_VERSION, type PaymentRequirements } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { evmAdapter, EVM_NETWORKS, isEvmAddress } from '../src/index.js'

const requirements: PaymentRequirements = {
  scheme: evmAdapter.scheme,
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 60,
}

describe('evm adapter', () => {
  it('advertises the buyer-family scheme', () => {
    expect(evmAdapter.family).toBe('evm')
    expect(evmAdapter.scheme).toBe(SCHEME_IDS.evm)
    expect(EVM_NETWORKS).toContain(evmAdapter.network)
  })

  it('refuses to verify until the chain logic exists', async () => {
    const result = await evmAdapter.verify(
      { x402Version: X402_VERSION, accepted: requirements, payload: {} },
      requirements,
    )
    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('not_implemented')
  })

  it('checks an address without calling an RPC', () => {
    expect(isEvmAddress('0x0000000000000000000000000000000000000001')).toBe(true)
    expect(isEvmAddress('not-an-address')).toBe(false)
  })
})
