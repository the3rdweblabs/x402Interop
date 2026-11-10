// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import type { QuoteRequest } from '../src/index.js'
import {
  MockOneClickClient,
  mintQuote,
  parseQuoteRequest,
  quoteToRequirements,
  selectPaymentPath,
} from '../src/index.js'

const SELLER_ADDRESS = 'seller.sui'
const BUYER_ADDRESS = 'buyer.base'

const REQUEST: QuoteRequest = {
  sellerNetwork: 'sui:mainnet',
  sellerAsset: 'nep141:sui-usdc.omft.near',
  sellerAddress: SELLER_ADDRESS,
  amount: '50000',
  buyerNetwork: 'eip155:8453',
  buyerAsset: 'nep141:base-usdc.omft.near',
  buyerAddress: BUYER_ADDRESS,
  deliveryMode: 'on_deposit' as const,
}

describe('parseQuoteRequest', () => {
  it('parses a valid request', () => {
    const parsed = parseQuoteRequest(REQUEST)
    expect(parsed.amount).toBe('50000')
    expect(parsed.sellerNetwork).toBe('sui:mainnet')
    expect(parseQuoteRequest({ ...REQUEST, depositType: 'INTENTS' }).depositType).toBe('INTENTS')
    expect(parseQuoteRequest({ ...REQUEST, swapType: 'EXACT_INPUT' }).swapType).toBe('EXACT_INPUT')
  })

  it('rejects a non-atomic amount and an unknown delivery mode', () => {
    expect(() => parseQuoteRequest({ ...REQUEST, amount: '0.05' })).toThrow()
    expect(() => parseQuoteRequest({ ...REQUEST, deliveryMode: 'later' })).toThrow()
  })
})

describe('selectPaymentPath', () => {
  it('routes lightning buyers to a top-up', () => {
    expect(selectPaymentPath({ buyerNetwork: 'lightning:mainnet' })).toBe('lightning_topup')
    expect(selectPaymentPath({ buyerNetwork: 'lightning' })).toBe('lightning_topup')
  })

  it('prefers an Intents balance when the facilitator says so', () => {
    expect(selectPaymentPath({ buyerNetwork: 'eip155:8453', depositType: 'INTENTS' })).toBe(
      'intents_balance',
    )
  })

  it('defaults to a single-use deposit address', () => {
    expect(selectPaymentPath({ buyerNetwork: 'eip155:8453' })).toBe('deposit_address')
    expect(selectPaymentPath({ buyerNetwork: 'sui:mainnet', depositType: 'ORIGIN_CHAIN' })).toBe(
      'deposit_address',
    )
  })
})

describe('mintQuote', () => {
  it('mints a deterministic offline quote through the mock 1Click client', async () => {
    const quote = await mintQuote(REQUEST, new MockOneClickClient())

    expect(quote.quoteId).toMatch(/^mock-/)
    expect(quote.depositAddress).toMatch(/^0x1c/)
    expect(quote.originNetwork).toBe(REQUEST.buyerNetwork)
    expect(quote.originAsset).toBe(REQUEST.buyerAsset)
    expect(quote.originAmount).toBe(REQUEST.amount)
    expect(quote.destinationAmount).toBe(REQUEST.amount)
    expect(quote.deliveryMode).toBe('on_deposit')
    expect(quote.refundTo).toBe(BUYER_ADDRESS)
    expect(quote.expiresAt).toBeTruthy()
  })

  it('mints Intents-balance quotes for INTENTS deposits', async () => {
    const quote = await mintQuote({ ...REQUEST, depositType: 'INTENTS' }, new MockOneClickClient())
    expect(quote.depositAddress).toBeTruthy()
    expect(quote.quoteId).toBeTruthy()
  })

  it('forwards an explicit swap type to 1Click', async () => {
    const quote = vi.fn(async () => ({
      quoteId: 'q-1',
      depositAddress: 'deposit',
      depositMemo: 'memo-1',
      originAmount: '50000',
      destinationAmount: '49900',
      timeEstimateSeconds: 30,
      expiresAt: '2026-11-02T12:30:00.000Z',
    }))
    const client = { quote, status: vi.fn(), submitDeposit: vi.fn() }

    const minted = await mintQuote({ ...REQUEST, swapType: 'EXACT_INPUT' }, client)

    expect(quote).toHaveBeenCalledWith(expect.objectContaining({ swapType: 'EXACT_INPUT' }))
    expect(minted.destinationAmount).toBe('49900')
    expect(minted.depositMemo).toBe('memo-1')
  })
})

describe('quoteToRequirements', () => {
  it('pays to the deposit address and names the seller the recipient', async () => {
    const quote = await mintQuote(REQUEST, new MockOneClickClient())
    const prepared = quoteToRequirements(REQUEST, quote, 'x402interop-evm')

    expect(prepared.path).toBe('deposit_address')
    expect(prepared.requirements.scheme).toBe('x402interop-evm')
    expect(prepared.requirements.network).toBe(REQUEST.sellerNetwork)
    expect(prepared.requirements.amount).toBe(REQUEST.amount)
    expect(prepared.requirements.payTo).toBe(quote.depositAddress)
    expect(prepared.requirements.extra.recipient).toBe(SELLER_ADDRESS)
    expect(prepared.requirements.extra.quoteId).toBe(quote.quoteId)
    expect(prepared.requirements.extra.buyerAsset).toBe(REQUEST.buyerAsset)
    expect(prepared.extensions.x402interop).toBeDefined()
    expect(prepared.extensions.x402interop.info.depositAddress).toBe(quote.depositAddress)
  })

  it('builds origin-side exact requirements', async () => {
    const request: QuoteRequest = {
      ...REQUEST,
      sellerNetwork: 'near:mainnet',
      sellerAsset: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      sellerAddress: 'seller.near',
      buyerNetwork: 'sui:mainnet',
      buyerAsset: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      buyerAddress: `0x${'22'.repeat(32)}`,
    }
    const quote = await mintQuote(request, new MockOneClickClient())
    const prepared = quoteToRequirements(request, quote, 'exact', { feePayer: 'fee-payer' })

    expect(prepared.requirements.scheme).toBe('exact')
    expect(prepared.requirements.network).toBe('sui:mainnet')
    expect(prepared.requirements.asset).toBe(request.buyerAsset)
    expect(prepared.requirements.amount).toBe(quote.originAmount)
    expect(prepared.requirements.payTo).toBe(quote.depositAddress)
    expect(prepared.requirements.extra.feePayer).toBe('fee-payer')
    expect(prepared.requirements.extra.sellerNetwork).toBe('near:mainnet')
    expect(prepared.requirements.extra.sellerAddress).toBe('seller.near')
    expect(prepared.extensions.x402interop.info.depositAddress).toBe(quote.depositAddress)
  })

  it('forwards slippage and exposes the quote fee fields', async () => {
    const client = {
      quote: vi.fn(async () => ({
        quoteId: 'q-fees',
        depositAddress: 'deposit',
        originAmount: '222270',
        destinationAmount: '200000',
        minAmountIn: '220000',
        withdrawFee: '20000',
        refundFee: '2400',
        amountInFormatted: '0.22227',
        amountOutFormatted: '0.2',
        timeEstimateSeconds: 50,
        expiresAt: '2030-01-01T00:00:00.000Z',
      })),
      status: vi.fn(),
      submitDeposit: vi.fn(),
    }
    const quote = await mintQuote(REQUEST, client, { slippageBps: 250 })

    expect(client.quote).toHaveBeenCalledWith(expect.objectContaining({ slippageBps: 250 }))
    expect(quote).toMatchObject({
      minAmountIn: '220000',
      withdrawFee: '20000',
      refundFee: '2400',
      amountInFormatted: '0.22227',
      amountOutFormatted: '0.2',
    })
  })

  it('always sends the seller to its final address, including NEAR', async () => {
    const client = {
      quote: vi.fn(async () => ({
        quoteId: 'q-near',
        depositAddress: 'deposit',
        originAmount: '50000',
        destinationAmount: '49900',
        timeEstimateSeconds: 30,
        expiresAt: '2030-01-01T00:00:00.000Z',
      })),
      status: vi.fn(),
      submitDeposit: vi.fn(),
    }
    const quote = await mintQuote(
      { ...REQUEST, sellerNetwork: 'near:mainnet', sellerAddress: 'seller.near' },
      client,
    )
    expect(quote.recipientType).toBe('DESTINATION_CHAIN')
    expect(client.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'seller.near',
        recipientType: 'DESTINATION_CHAIN',
      }),
    )
  })

  it('uses the reported destination amount for EXACT_INPUT requirements', async () => {
    const quote = await mintQuote(REQUEST, new MockOneClickClient())
    const prepared = quoteToRequirements(
      { ...REQUEST, amount: '51000' },
      { ...quote, destinationAmount: '49900' },
      'x402interop-evm',
    )

    expect(prepared.requirements.amount).toBe('49900')
  })

  it('derives maxTimeoutSeconds from the payment window', async () => {
    const quote = await mintQuote(REQUEST, new MockOneClickClient())
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const prepared = quoteToRequirements(REQUEST, { ...quote, expiresAt }, 'x402interop-evm')

    expect(prepared.requirements.maxTimeoutSeconds).toBeGreaterThan(1700)
    expect(prepared.requirements.maxTimeoutSeconds).toBeLessThanOrEqual(1800)
    expect(prepared.requirements.extra.expiresAt).toBe(expiresAt)
  })

  it('keeps the historical 300-second fallback once a quote has expired', async () => {
    const quote = await mintQuote(REQUEST, new MockOneClickClient())
    const prepared = quoteToRequirements(
      REQUEST,
      { ...quote, expiresAt: '2020-01-01T00:00:00.000Z' },
      'x402interop-evm',
    )

    expect(prepared.requirements.maxTimeoutSeconds).toBe(300)
  })
})
