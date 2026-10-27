// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { X402InteropQuoteInfo } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import {
  parseQuoteRequest,
  prepareQuote,
  selectPaymentPath,
  type QuoteRequest,
} from '../src/index.js'

const request: QuoteRequest = {
  sellerNetwork: 'sui:mainnet',
  sellerAsset: 'usdc',
  sellerAddress: 'seller',
  amount: '50000',
  buyerNetwork: 'eip155:8453',
  buyerAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  buyerAddress: 'buyer',
  deliveryMode: 'on_deposit',
}

const quote: X402InteropQuoteInfo = {
  quoteId: 'q-1',
  depositAddress: 'deposit',
  originNetwork: 'eip155:8453',
  originAsset: request.buyerAsset,
  originAmount: '51000',
  expiresAt: '2026-10-27T12:00:00Z',
  timeEstimateSeconds: 45,
  deliveryMode: 'on_deposit',
  refundTo: 'buyer',
}

describe('quote router', () => {
  it('parses the facilitator quote body', () => {
    expect(parseQuoteRequest(request).amount).toBe('50000')
    expect(() => parseQuoteRequest({ ...request, amount: 'five' })).toThrow()
  })

  it('picks a path from the buyer network and deposit type', () => {
    expect(selectPaymentPath({ buyerNetwork: 'lightning' })).toBe('lightning_topup')
    expect(selectPaymentPath({ buyerNetwork: 'lightning:mainnet' })).toBe('lightning_topup')
    expect(selectPaymentPath({ buyerNetwork: 'eip155:8453', depositType: 'INTENTS' })).toBe(
      'intents_balance',
    )
    expect(selectPaymentPath({ buyerNetwork: 'eip155:8453', depositType: 'ORIGIN_CHAIN' })).toBe(
      'deposit_address',
    )
    expect(selectPaymentPath({ buyerNetwork: 'eip155:8453' })).toBe('deposit_address')
  })

  it('builds requirements and extensions.x402interop from a supplied quote', () => {
    const prepared = prepareQuote(request, quote, 'x402interop-evm')
    expect(prepared.path).toBe('deposit_address')
    expect(prepared.requirements.payTo).toBe('seller')
    expect(prepared.requirements.extra).toMatchObject({ quoteId: 'q-1', depositAddress: 'deposit' })
    expect(prepared.extensions.x402interop.info.refundTo).toBe('buyer')
  })
})
