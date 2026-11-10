// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import {
  buildPaymentRequired,
  x402interop,
  type HttpResponseLike,
  type SellerOptions,
} from '../src/middleware.js'
import { expandRoutes, interopAccept } from '../src/index.js'

const options: SellerOptions = {
  facilitator: 'https://facilitator.example.com',
  payTo: 'seller',
  network: 'sui:mainnet',
  asset: 'usdc',
  price: '0.05',
  amount: '50000',
  deliveryMode: 'on_deposit',
}

function requiredBody(res: HttpResponseLike & { headers: Record<string, string> }): any {
  return JSON.parse(Buffer.from(res.headers['payment-required'] ?? '', 'base64').toString('utf8'))
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
    expect(res.headers['content-type']).toContain('application/json')
    expect(JSON.parse(res.body)).toEqual({ error: 'Payment required' })
    expect(requiredBody(res).x402Version).toBe(2)
    expect(next).not.toHaveBeenCalled()
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

  it('returns the full JSON body to browsers by default', () => {
    const res = response()
    x402interop(options)({ headers: { accept: 'text/html' } }, res, vi.fn())
    expect(res.statusCode).toBe(402)
    expect(res.headers['content-type']).toContain('application/json')
    expect(JSON.parse(res.body).x402Version).toBe(2)
    expect(JSON.parse(res.body).accepts?.[0]?.scheme).toBeTruthy()
  })

  it('forces the full JSON body when configured', () => {
    const res = response()
    x402interop({ ...options, paymentRequiredBody: 'json' })({ headers: {} }, res, vi.fn())
    expect(res.headers['content-type']).toContain('application/json')
    expect(JSON.parse(res.body).x402Version).toBe(2)
  })

  it('can return the minimal x402.org error body', () => {
    const res = response()
    x402interop({ ...options, paymentRequiredBody: 'error' })({ headers: {} }, res, vi.fn())
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.body)).toEqual({ error: 'Payment required' })
    expect(res.headers['payment-required']).toBeTruthy()
  })

  it('can return a truly empty body when requested', () => {
    const res = response()
    x402interop({ ...options, paymentRequiredBody: 'empty' })({ headers: {} }, res, vi.fn())
    expect(res.statusCode).toBe(402)
    expect(res.body).toBe('')
    expect(res.headers['payment-required']).toBeTruthy()
  })

  it('keeps the full 402 body when explicitly requested', () => {
    const res = response()
    x402interop({ ...options, paymentRequiredBody: 'json' })({ headers: {} }, res, vi.fn())
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.body).x402Version).toBe(2)
  })

  it('interopAccept expands "all" to include x402interop-evm on eip155:8453 with a vacant payTo', () => {
    const entries = interopAccept({ price: '$0.10' })
    expect(entries.length).toBeGreaterThan(1)
    expect(entries).toContainEqual({
      scheme: 'x402interop-evm',
      network: 'eip155:8453',
      payTo: '',
      price: '$0.10',
    })
    expect(entries.every((entry) => entry.payTo === '')).toBe(true)
  })

  it('expandRoutes expands a "$interop" entry and passes non-$ entries through', () => {
    const routes = {
      'GET /interop': {
        description: 'Cross-chain weather',
        accepts: [{ scheme: '$interop', price: '$0.01', payTo: '' }],
      },
      'GET /same': {
        description: 'Same-chain weather',
        accepts: [{ scheme: 'exact', network: 'eip155:8453', price: '$0.01', payTo: '0xSeller' }],
      },
    }
    const expanded = expandRoutes(routes)
    expect(expanded['GET /interop']?.description).toBe('Cross-chain weather')
    expect(expanded['GET /interop']?.accepts.length).toBeGreaterThan(10)
    expect(expanded['GET /interop']?.accepts).toContainEqual({
      scheme: 'x402interop-evm',
      network: 'eip155:8453',
      payTo: '',
      price: '$0.01',
    })
    expect(expanded['GET /same']?.description).toBe('Same-chain weather')
    expect(expanded['GET /same']?.accepts).toEqual(routes['GET /same']?.accepts)
  })
})

describe('x402interop middleware behaviors', () => {
  it('verifies and settles before serving a paid request', async () => {
    const accepted = {
      scheme: 'x402interop-evm',
      network: 'sui:mainnet',
      asset: 'usdc',
      amount: '50000',
      payTo: 'seller',
      maxTimeoutSeconds: 300,
    }
    const payload = { x402Version: 2 as const, accepted, payload: { binding: {} } }
    const stub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ isValid: true, success: true, transaction: '0xabc' }),
    }))
    vi.stubGlobal('fetch', stub)
    const res = response()
    const next = vi.fn()
    x402interop(options)(
      { headers: { 'payment-signature': Buffer.from(JSON.stringify(payload)).toString('base64') } },
      res,
      next,
    )
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).toHaveBeenCalledTimes(1)
    // Both calls happen: verification without settlement leaves the nonce
    // unconsumed and lets the same payment be replayed.
    expect(stub).toHaveBeenCalledTimes(2)
    expect(res.headers['PAYMENT-RESPONSE']).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('never calls the handler when verification fails', async () => {
    const accepted = {
      scheme: 'x402interop-evm',
      network: 'sui:mainnet',
      asset: 'usdc',
      amount: '50000',
      payTo: 'seller',
      maxTimeoutSeconds: 300,
    }
    const payload = { x402Version: 2 as const, accepted, payload: { binding: {} } }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ isValid: false, invalidReason: 'nonce_reused' }),
      })),
    )
    const res = response()
    const next = vi.fn()
    x402interop(options)(
      { headers: { 'payment-signature': Buffer.from(JSON.stringify(payload)).toString('base64') } },
      res,
      next,
    )
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.body).error).toBe('nonce_reused')
    vi.unstubAllGlobals()
  })

  it('rejects a payment header that is not payment JSON', async () => {
    const res = response()
    const next = vi.fn()
    x402interop(options)({ headers: { 'payment-signature': 'not-base64-json' } }, res, next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.body).error).toBe('invalid_payment_header')
  })

  it('rejects a payment against terms the seller never offered', async () => {
    const payload = {
      x402Version: 2 as const,
      accepted: {
        scheme: 'x402interop-utxo',
        network: 'bip122:000000000019d6689c085ae165831e93',
        asset: 'btc',
        amount: '1',
        payTo: 'seller',
      },
      payload: { binding: {} },
    }
    const res = response()
    const next = vi.fn()
    x402interop(options)(
      { headers: { 'payment-signature': Buffer.from(JSON.stringify(payload)).toString('base64') } },
      res,
      next,
    )
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.body).error).toBe('unsupported_payment')
  })

  it('fails closed with 503 when the facilitator is unreachable', async () => {
    const accepted = {
      scheme: 'x402interop-evm',
      network: 'sui:mainnet',
      asset: 'usdc',
      amount: '50000',
      payTo: 'seller',
      maxTimeoutSeconds: 300,
    }
    const payload = { x402Version: 2 as const, accepted, payload: { binding: {} } }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    const res = response()
    const next = vi.fn()
    x402interop(options)(
      { headers: { 'payment-signature': Buffer.from(JSON.stringify(payload)).toString('base64') } },
      res,
      next,
    )
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.body).error).toBe('verification_unavailable')
    expect(JSON.parse(res.body).retryable).toBe(true)
    vi.unstubAllGlobals()
  })

  it('answers 202 and does not serve when a pending_push swap is still running', async () => {
    const accepted = {
      scheme: 'x402interop-evm',
      network: 'sui:mainnet',
      asset: 'usdc',
      amount: '50000',
      payTo: 'seller',
      maxTimeoutSeconds: 300,
    }
    const payload = { x402Version: 2 as const, accepted, payload: { binding: {} } }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          isValid: true,
          success: true,
          transaction: '0xabc',
          extra: { swapStatus: 'PROCESSING' },
        }),
      })),
    )
    const res = response()
    const next = vi.fn()
    x402interop({ ...options, deliveryMode: 'pending_push' })(
      { headers: { 'payment-signature': Buffer.from(JSON.stringify(payload)).toString('base64') } },
      res,
      next,
    )
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(202)
    expect(JSON.parse(res.body).accepted).toBe('pending')
    vi.unstubAllGlobals()
  })

  it('serves on on_deposit once the origin deposit is secured', async () => {
    const accepted = {
      scheme: 'x402interop-evm',
      network: 'sui:mainnet',
      asset: 'usdc',
      amount: '50000',
      payTo: 'seller',
      maxTimeoutSeconds: 300,
    }
    const payload = { x402Version: 2 as const, accepted, payload: { binding: {} } }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          isValid: true,
          success: true,
          transaction: '0xabc',
          extra: { swapStatus: 'PROCESSING' },
        }),
      })),
    )
    const res = response()
    const next = vi.fn()
    x402interop({ ...options, deliveryMode: 'on_deposit' })(
      { headers: { 'payment-signature': Buffer.from(JSON.stringify(payload)).toString('base64') } },
      res,
      next,
    )
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.headers['x-x402interop-accepted']).toBe('deposit')
    vi.unstubAllGlobals()
  })

  it('skips quote minting when mintQuotes is not opted in', () => {
    const res = response()
    const next = vi.fn()
    x402interop({ ...options, mintQuotes: false })({ headers: {} }, res, next)
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.body)).toEqual({ error: 'Payment required' })
    expect(requiredBody(res).x402Version).toBe(2)
  })

  it('derives the default buyer network per buyer scheme', () => {
    const svm = buildPaymentRequired({ ...options, buyerSchemes: ['x402interop-svm'] })
    const sui = buildPaymentRequired({ ...options, buyerSchemes: ['x402interop-sui'] })
    const near = buildPaymentRequired({ ...options, buyerSchemes: ['x402interop-near'] })
    expect(svm.accepts[0]?.scheme).toBe('x402interop-svm')
    expect(sui.accepts[0]?.scheme).toBe('x402interop-sui')
    expect(near.accepts[0]?.scheme).toBe('x402interop-near')
  })

  it('mints quotes through the facilitator when opted in', async () => {
    const quoteBody = {
      x402Version: 2,
      accepts: [{ scheme: 'x402interop-evm', network: 'eip155:8453', price: '0.05' }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => quoteBody,
      })),
    )
    const res = response()
    const next = vi.fn()
    x402interop({
      ...options,
      mintQuotes: true,
      apiKey: 'secret',
      buyerNetwork: 'eip155:8453',
    })({ headers: {} }, res, next)
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(res.statusCode).toBe(402)
    expect(res.headers['payment-required']).toBeTruthy()
    expect(JSON.parse(res.body)).toEqual({ error: 'Payment required' })
    expect(requiredBody(res).x402Version).toBe(2)
    vi.unstubAllGlobals()
  })

  it('fails closed when the facilitator is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    const res = response()
    const next = vi.fn()
    x402interop({ ...options, mintQuotes: true })({ headers: {} }, res, next)
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body)).toMatchObject({ error: 'quote_unavailable' })
    vi.unstubAllGlobals()
  })

  it('honours an already-sent 402 during async minting', async () => {
    const quoteBody = { x402Version: 2, accepts: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => quoteBody })),
    )
    const res = response()
    res.statusCode = 402
    ;(res as unknown as { headersSent: boolean }).headersSent = true
    const next = vi.fn()
    x402interop({ ...options, mintQuotes: true })({ headers: {} }, res, next)
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(res.statusCode).toBe(402)
    expect(res.body).toBe('')
    vi.unstubAllGlobals()
  })

  it('falls back silently when minting fails on an already-sent 402', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    const res = response()
    res.statusCode = 402
    ;(res as unknown as { headersSent: boolean }).headersSent = true
    const next = vi.fn()
    x402interop({ ...options, mintQuotes: true })({ headers: {} }, res, next)
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(res.statusCode).toBe(402)
    expect(res.body).toBe('')
    vi.unstubAllGlobals()
  })

  it('derives svm/sui/near mint networks from the buyer scheme', async () => {
    const quoteBody = { x402Version: 2, accepts: [] }
    const fetched: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url)
        return { ok: true, status: 200, json: async () => quoteBody }
      }),
    )
    for (const buyerSchemes of [['x402interop-svm'], ['x402interop-sui'], ['x402interop-near']]) {
      const res = response()
      const next = vi.fn()
      x402interop({ ...options, mintQuotes: true, buyerSchemes })({ headers: {} }, res, next)
      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))
      expect(res.statusCode).toBe(402)
    }
    expect(fetched.length).toBe(3)
    vi.unstubAllGlobals()
  })
})

describe('interopAccept / expandRoutes sugar', () => {
  it('expands explicit scheme and network lists without widening them', () => {
    const entries = interopAccept({
      price: '0.01',
      schemes: ['x402interop-evm'],
      networks: ['eip155:8453'],
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      scheme: 'x402interop-evm',
      network: 'eip155:8453',
      payTo: '',
      price: '0.01',
    })
  })

  it('honours asset overrides and maxTimeoutSeconds', () => {
    const entries = interopAccept({
      price: '0.01',
      schemes: ['x402interop-near'],
      networks: ['near:mainnet'],
      maxTimeoutSeconds: 120,
      assetOverrides: { asset: 'custom-asset' },
    })
    expect(entries[0]?.maxTimeoutSeconds).toBe(120)
  })

  it('expands $all across the full catalogue', () => {
    const entries = interopAccept({ price: '0.01', schemes: 'all', networks: 'all' })
    expect(entries.some((e) => e.scheme === 'x402interop-evm' && e.network === 'eip155:8453')).toBe(
      true,
    )
    expect(entries.length).toBeGreaterThan(20)
  })

  it('replaces $interop sugar and passes other entries through', () => {
    const expanded = expandRoutes({
      'GET /a': { accepts: [{ scheme: '$interop', network: '$all', price: '0.01' }] },
      'POST /b': {
        accepts: [{ scheme: 'exact', network: 'eip155:8453', price: '0.02', payTo: '0xSeller' }],
      },
    })
    const a = expanded['GET /a']?.accepts ?? []
    expect(a.length).toBeGreaterThan(12)
    expect(expanded['POST /b']?.accepts).toEqual([
      { scheme: 'exact', network: 'eip155:8453', price: '0.02', payTo: '0xSeller' },
    ])
  })

  it('expands $exact sugar across the requested networks', () => {
    const expanded = expandRoutes({
      'GET /x': { accepts: [{ scheme: '$exact', network: 'eip155:8453', price: '0.02' }] },
    })
    const accepts = expanded['GET /x']?.accepts ?? []
    expect(accepts).toHaveLength(1)
    expect(accepts[0]).toMatchObject({
      scheme: 'exact',
      network: 'eip155:8453',
      price: '0.02',
      payTo: '',
    })
  })

  it('expands unknown $tokens to a single named scheme', () => {
    const expanded = expandRoutes({
      'GET /c': { accepts: [{ scheme: '$upto', network: 'eip155:8453', price: '0.03' }] },
    })
    const accepts = expanded['GET /c']?.accepts ?? []
    expect(accepts[0]).toMatchObject({
      scheme: 'upto',
      network: 'eip155:8453',
      price: '0.03',
      payTo: '',
    })
  })

  it('passes through slots without an accepts array', () => {
    const expanded = expandRoutes({ 'GET /plain': { description: 'free' } })
    expect(expanded['GET /plain']).toEqual({ description: 'free' })
  })
})
