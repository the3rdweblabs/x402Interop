// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import {
  buildPaymentRequired,
  x402interop,
  type HttpResponseLike,
  type SellerOptions,
} from '../src/index.js'

const options: SellerOptions = {
  facilitator: 'https://facilitator.example.com',
  payTo: 'seller',
  network: 'sui:mainnet',
  asset: 'usdc',
  price: '0.05',
  amount: '50000',
  deliveryMode: 'on_deposit',
}

function response(): HttpResponseLike & { body: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {}
  const res = {
    statusCode: 200,
    headers,
    body: '',
    setHeader(name: string, value: string | number) {
      headers[name] = String(value)
    },
    end(body?: string) {
      this.body = body ?? ''
    },
  }
  return res
}

describe('x402interop middleware', () => {
  it('builds one requirement per buyer scheme', () => {
    const single = buildPaymentRequired(options)
    expect(single.accepts).toHaveLength(1)
    expect(single.accepts[0]?.extra).toMatchObject({
      displayPrice: '0.05',
      deliveryMode: 'on_deposit',
    })
    const many = buildPaymentRequired({
      ...options,
      buyerSchemes: ['x402interop-evm', 'x402interop-sui'],
      maxTimeoutSeconds: 120,
      resource: { url: 'https://seller.example/report', mimeType: 'application/json' },
    })
    expect(many.accepts.map((entry) => entry.scheme)).toEqual([
      'x402interop-evm',
      'x402interop-sui',
    ])
    expect(many.accepts[0]?.maxTimeoutSeconds).toBe(120)
    expect(many.resource.url).toBe('https://seller.example/report')
  })

  it('answers 402 when the payment header is missing', () => {
    const res = response()
    const next = vi.fn()
    x402interop(options)({ headers: {} }, res, next)
    expect(res.statusCode).toBe(402)
    expect(res.headers['payment-required']).toBeTruthy()
    expect(JSON.parse(res.body).x402Version).toBe(2)
    expect(next).not.toHaveBeenCalled()
  })

  it('reads an array header and continues when a payment is present', () => {
    const res = response()
    const next = vi.fn()
    x402interop(options)({ headers: { 'payment-signature': ['signed'] } }, res, next)
    expect(next).toHaveBeenCalledOnce()
    x402interop(options)({ headers: { 'x-payment': 'legacy' } }, response(), next)
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('ignores an empty array header and answers 402', () => {
    const res = response()
    const next = vi.fn()
    x402interop(options)({ headers: { 'payment-signature': [] } }, res, next)
    expect(res.statusCode).toBe(402)
    expect(next).not.toHaveBeenCalled()
  })

  it('sets canonical PAYMENT-REQUIRED header', () => {
    const res = response()
    const next = vi.fn()
    x402interop(options)({ headers: {} }, res, next)
    expect(res.headers['PAYMENT-REQUIRED']).toBeTruthy()
    expect(res.headers['payment-required']).toBeTruthy()
  })

  it('reads PAYMENT-SIGNATURE uppercase header', () => {
    const res = response()
    const next = vi.fn()
    x402interop(options)({ headers: { 'PAYMENT-SIGNATURE': 'signed' } }, res, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
