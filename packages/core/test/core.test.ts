// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import {
  createStubAdapter,
  familyForScheme,
  hasPaymentAmount,
  isInteropScheme,
  parsePaymentRequirements,
  parseX402InteropExtension,
  readX402InteropExtension,
  SCHEME_IDS,
  X402_VERSION,
  x402InteropExtension,
  type PaymentPayload,
  type PaymentRequirements,
  type X402InteropQuoteInfo,
} from '../src/index.js'

const quote: X402InteropQuoteInfo = {
  quoteId: 'q-1',
  depositAddress: '0x1111111111111111111111111111111111111111',
  originNetwork: 'eip155:8453',
  originAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  originAmount: '51000',
  expiresAt: '2026-10-27T12:00:00Z',
  timeEstimateSeconds: 45,
  deliveryMode: 'on_deposit',
  refundTo: '0x2222222222222222222222222222222222222222',
}

const requirements: PaymentRequirements = {
  scheme: 'x402interop-evm',
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 300,
  extra: { ...quote },
}

function payload(scheme: string): PaymentPayload {
  return {
    x402Version: X402_VERSION,
    accepted: { ...requirements, scheme },
    payload: { authorization: {}, binding: { quoteId: quote.quoteId } },
  }
}

describe('x402 v2 types', () => {
  it('speaks protocol version 2', () => {
    expect(X402_VERSION).toBe(2)
  })

  it('accepts a positive atomic amount and rejects zero or junk', () => {
    expect(hasPaymentAmount(requirements)).toBe(true)
    expect(hasPaymentAmount({ ...requirements, amount: '0' })).toBe(false)
    expect(hasPaymentAmount({ ...requirements, amount: '0.05' })).toBe(false)
  })

  it('parses payment requirements and rejects a missing scheme', () => {
    expect(parsePaymentRequirements(requirements).payTo).toBe('seller')
    expect(() => parsePaymentRequirements({ ...requirements, scheme: '' })).toThrow()
  })
})

describe('extensions.x402interop', () => {
  it('builds and reads the extension', () => {
    const extension = x402InteropExtension(quote)
    expect(parseX402InteropExtension(extension).info.quoteId).toBe('q-1')
    expect(readX402InteropExtension({ x402interop: extension })?.info.depositAddress).toBe(
      quote.depositAddress,
    )
  })

  it('returns undefined for missing or malformed extensions', () => {
    expect(readX402InteropExtension(undefined)).toBeUndefined()
    expect(readX402InteropExtension({})).toBeUndefined()
    expect(readX402InteropExtension({ x402interop: 'nope' })).toBeUndefined()
    expect(readX402InteropExtension({ x402interop: null })).toBeUndefined()
    expect(readX402InteropExtension({ x402interop: [] })).toBeUndefined()
    expect(readX402InteropExtension({ x402interop: { info: 'x' } })).toBeUndefined()
  })
})

describe('scheme ids', () => {
  it('names TON tvm and recognises the family', () => {
    expect(SCHEME_IDS.ton).toBe('x402interop-tvm')
    expect(isInteropScheme('x402interop-evm')).toBe(true)
    expect(isInteropScheme('exact')).toBe(false)
    expect(familyForScheme('x402interop-svm')).toBe('svm')
    expect(familyForScheme('exact')).toBeUndefined()
  })
})

describe('createStubAdapter', () => {
  const adapter = createStubAdapter({
    family: 'sui',
    scheme: 'x402interop-sui',
    network: 'sui:mainnet',
  })

  it('rejects a mismatched scheme without settling', async () => {
    const wrong = payload('x402interop-evm')
    const verified = await adapter.verify(wrong, requirements)
    expect(verified).toEqual({ isValid: false, invalidReason: 'scheme_mismatch' })
    const settled = await adapter.settle(wrong, requirements)
    expect(settled.success).toBe(false)
    expect(settled.errorReason).toBe('scheme_mismatch')
    expect(settled.transaction).toBe('')
  })

  it('rejects when the payload matches and the requirements do not', async () => {
    const matchedPayload = payload('x402interop-sui')
    const verified = await adapter.verify(matchedPayload, requirements)
    expect(verified.invalidReason).toBe('scheme_mismatch')
    const settled = await adapter.settle(matchedPayload, requirements)
    expect(settled.errorReason).toBe('scheme_mismatch')
  })

  it('reports not_implemented when the scheme matches', async () => {
    const matchedRequirements = { ...requirements, scheme: 'x402interop-sui' }
    const matched = payload('x402interop-sui')
    const verified = await adapter.verify(matched, matchedRequirements)
    expect(verified.isValid).toBe(false)
    expect(verified.invalidReason).toBe('not_implemented')
    const settled = await adapter.settle(matched, matchedRequirements)
    expect(settled.errorReason).toBe('not_implemented')
    expect(settled.network).toBe('sui:mainnet')
  })
})
