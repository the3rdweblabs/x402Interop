// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
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

  it('validates addresses when present', async () => {
    const badReq = { ...requirements, payTo: '0xinvalid' } as any
    const res = await evmAdapter.verify({ x402Version: X402_VERSION, accepted: badReq, payload: {} }, badReq)
    expect(res.invalidReason).toBe('invalid_recipient')
    const badBinding = { ...requirements, payTo: '0x0000000000000000000000000000000000000001' }
    const res2 = await evmAdapter.verify({ x402Version: X402_VERSION, accepted: badBinding, payload: { binding: { depositAddress: '0xinvalid' } } }, badBinding)
    expect(res2.invalidReason).toBe('invalid_binding')
    const okBinding = await evmAdapter.verify({ x402Version: X402_VERSION, accepted: badBinding, payload: { binding: { depositAddress: '0x0000000000000000000000000000000000000002' } } }, badBinding)
    expect(okBinding.invalidReason).toBe('not_implemented')
    const settled = await evmAdapter.settle({ x402Version: X402_VERSION, accepted: requirements, payload: {} }, requirements)
    expect(settled.success).toBe(false)
    const settledBad = await evmAdapter.settle({ x402Version: X402_VERSION, accepted: { ...requirements, scheme: 'x402interop-sui' } as any, payload: {} }, requirements)
    expect(settledBad.success).toBe(false)
  })
})
