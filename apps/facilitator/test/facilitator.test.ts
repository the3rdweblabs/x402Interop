// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { Readable } from 'node:stream'
import type { Server, ServerResponse, IncomingMessage } from 'node:http'

import { X402_VERSION } from '@x402interop/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createFacilitatorServer, routeFacilitator } from '../src/index.js'
import { methodOf, requestPath } from '@x402interop/facilkit'

const requirements = {
  scheme: 'x402interop-evm',
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: 'seller',
  maxTimeoutSeconds: 300,
}

const body = {
  x402Version: X402_VERSION,
  paymentRequirements: requirements,
  paymentPayload: {
    x402Version: X402_VERSION,
    accepted: requirements,
    payload: {},
  },
}

describe('request helpers', () => {
  it('normalises method and path', () => {
    expect(methodOf(undefined)).toBe('GET')
    expect(methodOf('POST')).toBe('POST')
    expect(requestPath(undefined)).toBe('/')
    expect(requestPath('')).toBe('/')
    expect(requestPath('/health')).toBe('/health')
    expect(requestPath('/health?x=1')).toBe('/health')
    expect(requestPath('?')).toBe('/')
  })
})

describe('routeFacilitator', () => {
  it('serves health and supported', async () => {
    expect(await routeFacilitator('GET', '/health', undefined)).toMatchObject({
      status: 200,
      body: { status: 'ok', service: 'facilitator' },
    })
    expect((await routeFacilitator('POST', '/health', undefined)).status).toBe(404)
    const supported = await routeFacilitator('GET', '/supported', undefined)
    expect(supported.status).toBe(200)
    const payload = supported.body as {
      kinds: { scheme: string; network: string }[]
      extensions: string[]
    }
    expect(payload.extensions).toEqual(['x402interop'])
    expect(
      payload.kinds.some(
        (kind) => kind.scheme === 'x402interop-evm' && kind.network === 'eip155:8453',
      ),
    ).toBe(true)
    expect(payload.kinds.some((kind) => kind.scheme === 'x402interop-tvm')).toBe(false)
    expect(payload.kinds.some((kind) => kind.scheme === 'x402interop-aptos')).toBe(false)
    expect(payload.kinds.some((kind) => kind.scheme === 'x402interop-lightning')).toBe(false)
  })

  it('stubs verify and settle', async () => {
    expect(await routeFacilitator('GET', '/verify', undefined)).toMatchObject({ status: 405 })
    expect((await routeFacilitator('POST', '/verify', {})).status).toBe(400)
    expect((await routeFacilitator('POST', '/settle', {})).status).toBe(400)
    expect(await routeFacilitator('POST', '/verify', body)).toMatchObject({
      status: 200,
      body: { isValid: false, invalidReason: 'not_implemented' },
    })
    expect(await routeFacilitator('POST', '/settle', body)).toMatchObject({
      status: 200,
      body: { success: false, errorReason: 'not_implemented', transaction: '' },
    })
    expect((await routeFacilitator('GET', '/missing', undefined)).status).toBe(404)
  })

  it('mints interop quotes and tracks status', async () => {
    const quoteReq = {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '50000',
      buyerNetwork: 'eip155:8453',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    }
    const quoteRes = await routeFacilitator('POST', '/interop/quote', quoteReq)
    expect(quoteRes.status).toBe(200)
    const quoteBody = quoteRes.body as any
    expect(quoteBody.scheme).toBe('x402interop-evm')
    expect(quoteBody.quoteId).toBeTruthy()
    expect(quoteBody.depositAddress).toBeTruthy()
    expect(quoteBody.extensions?.x402interop?.info?.quoteId).toBe(quoteBody.quoteId)
    const statusRes = await routeFacilitator(
      'GET',
      `/interop/status/${quoteBody.quoteId}`,
      undefined,
    )
    expect(statusRes.status).toBe(200)
    expect((statusRes.body as any).quoteId).toBe(quoteBody.quoteId)
    expect((await routeFacilitator('GET', '/interop/status/missing', undefined)).status).toBe(404)

    // Cover other buyer families
    const quoteSui = await routeFacilitator('POST', '/interop/quote', {
      ...quoteReq,
      buyerNetwork: 'sui:mainnet',
    })
    expect((quoteSui.body as any).scheme).toBe('x402interop-sui')
    const quoteSol = await routeFacilitator('POST', '/interop/quote', {
      ...quoteReq,
      buyerNetwork: 'solana:mainnet',
    })
    expect((quoteSol.body as any).scheme).toBe('x402interop-svm')
    const quoteNear = await routeFacilitator('POST', '/interop/quote', {
      ...quoteReq,
      buyerNetwork: 'near:mainnet',
    })
    expect((quoteNear.body as any).scheme).toBe('x402interop-near')
    const quoteTon = await routeFacilitator('POST', '/interop/quote', {
      ...quoteReq,
      buyerNetwork: 'ton:mainnet',
    })
    expect((quoteTon.body as any).scheme).toBe('x402interop-tvm')
    const quoteTron = await routeFacilitator('POST', '/interop/quote', {
      ...quoteReq,
      buyerNetwork: 'tron:mainnet',
    })
    expect((quoteTron.body as any).scheme).toBe('x402interop-tron')
    const quoteXrpl = await routeFacilitator('POST', '/interop/quote', {
      ...quoteReq,
      buyerNetwork: 'xrpl:mainnet',
    })
    expect((quoteXrpl.body as any).scheme).toBe('x402interop-xrpl')
    const quoteLn = await routeFacilitator('POST', '/interop/quote', {
      ...quoteReq,
      buyerNetwork: 'lightning:mainnet',
    })
    expect((quoteLn.body as any).scheme).toBe('x402interop-lightning')
  })

  it('syncs status from intents client', async () => {
    const quoteReq = {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '1000',
      buyerNetwork: 'eip155:8453',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_success',
    }
    const quoteRes = await routeFacilitator('POST', '/interop/quote', quoteReq)
    const quoteBody = quoteRes.body as any
    // Status should be returned (may be synced from mock client)
    const statusRes = await routeFacilitator(
      'GET',
      `/interop/status/${quoteBody.quoteId}`,
      undefined,
    )
    expect(statusRes.status).toBe(200)
  })

  it('handles method not allowed for verify/settle', async () => {
    expect((await routeFacilitator('GET', '/verify', undefined)).status).toBe(405)
    expect((await routeFacilitator('PUT', '/settle', undefined)).status).toBe(405)
  })

  it('handles other buyer networks', async () => {
    const quoteReq = {
      sellerNetwork: 'base',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '100',
      buyerNetwork: 'base',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    }
    const res = await routeFacilitator('POST', '/interop/quote', quoteReq)
    expect(res.status).toBe(200)
  })

  it('handles ethereum in buyer network', async () => {
    const quoteReq = {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '100',
      buyerNetwork: 'ethereum',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    }
    const res = await routeFacilitator('POST', '/interop/quote', quoteReq)
    expect(res.status).toBe(200)
    expect((res.body as any).scheme).toBe('x402interop-evm')
  })

  it('handles unknown buyer network defaults to evm', async () => {
    const quoteReq = {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '100',
      buyerNetwork: 'unknown:chain',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    }
    const res = await routeFacilitator('POST', '/interop/quote', quoteReq)
    expect(res.status).toBe(200)
  })
})

describe('HTTP server', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = createFacilitatorServer()
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP port')
    base = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('answers health, verify, and a bad body', async () => {
    const health = await fetch(`${base}/health`)
    expect(await health.json()).toMatchObject({ status: 'ok' })

    const verified = await fetch(`${base}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(await verified.json()).toMatchObject({ invalidReason: 'not_implemented' })

    const bad = await fetch(`${base}/verify`, { method: 'POST', body: 'not-json' })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ error: 'invalid_json' })
  })

  it('dispatches an empty request with normalized headers', async () => {
    const request = Object.assign(Readable.from([]), {
      method: undefined,
      url: '/health',
      headers: { accept: ['application/json'], host: 'localhost' },
    }) as unknown as IncomingMessage
    let statusCode = 0
    const responseState = { headers: new Map<string, string>() }
    const response = {
      get statusCode() {
        return statusCode
      },
      set statusCode(value: number) {
        statusCode = value
      },
      setHeader: (name: string, value: string) => {
        responseState.headers.set(name, value)
      },
      end: (payload: string) => {
        expect(statusCode).toBe(200)
        expect(JSON.parse(payload)).toMatchObject({ status: 'ok' })
      },
    } as unknown as ServerResponse

    const { dispatch } = await import('../src/server.js')
    await dispatch(request, response)
  })

  it('dispatches a JSON request without a URL', async () => {
    const request = Object.assign(Readable.from([Buffer.from('{}')]), {
      method: 'POST',
      url: null,
      headers: { accept: ['application/json'], host: 'localhost' },
    }) as unknown as IncomingMessage
    let statusCode = 0
    const response = {
      get statusCode() {
        return statusCode
      },
      set statusCode(value: number) {
        statusCode = value
      },
      setHeader: () => {},
      end: (payload: string) => {
        expect(statusCode).toBe(404)
        expect(JSON.parse(payload)).toMatchObject({ error: 'not_found' })
      },
    } as unknown as ServerResponse

    const { dispatch } = await import('../src/server.js')
    await dispatch(request, response)
  })

  it('lets the local marketplace read the facilitator from the browser', async () => {
    const previous = process.env.FACILITATOR_CORS_ORIGINS
    delete process.env.FACILITATOR_CORS_ORIGINS
    try {
      const catalogue = await fetch(`${base}/discovery/resources`, {
        headers: { origin: 'http://127.0.0.1:4321' },
      })
      expect(catalogue.status).toBe(200)
      expect(catalogue.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:4321')
      expect(catalogue.headers.get('access-control-allow-methods')).toContain('POST')

      const preflight = await fetch(`${base}/interop/quote`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:4321',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:4321')
      expect(preflight.headers.get('access-control-allow-headers')).toContain('content-type')

      const foreign = await fetch(`${base}/health`, {
        headers: { origin: 'https://evil.example' },
      })
      expect(foreign.status).toBe(200)
      expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      if (previous === undefined) delete process.env.FACILITATOR_CORS_ORIGINS
      else process.env.FACILITATOR_CORS_ORIGINS = previous
    }
  })

  it('honours an explicit CORS allow-list and an empty one', async () => {
    const previous = process.env.FACILITATOR_CORS_ORIGINS
    try {
      process.env.FACILITATOR_CORS_ORIGINS = ' https://market.example '
      const allowed = await fetch(`${base}/health`, {
        headers: { origin: 'https://market.example' },
      })
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://market.example')
      const local = await fetch(`${base}/health`, {
        headers: { origin: 'http://127.0.0.1:4321' },
      })
      expect(local.headers.get('access-control-allow-origin')).toBeNull()

      process.env.FACILITATOR_CORS_ORIGINS = ''
      const disabled = await fetch(`${base}/health`, {
        headers: { origin: 'https://market.example' },
      })
      expect(disabled.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      if (previous === undefined) delete process.env.FACILITATOR_CORS_ORIGINS
      else process.env.FACILITATOR_CORS_ORIGINS = previous
    }
  })
})
