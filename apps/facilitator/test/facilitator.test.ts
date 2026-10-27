// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { Server } from 'node:http'

import { X402_VERSION } from '@x402interop/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createFacilitatorServer, methodOf, requestPath, routeFacilitator } from '../src/index.js'

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
  it('serves health and supported', () => {
    expect(routeFacilitator('GET', '/health', undefined)).toMatchObject({
      status: 200,
      body: { status: 'ok', service: 'facilitator' },
    })
    expect(routeFacilitator('POST', '/health', undefined).status).toBe(404)
    const supported = routeFacilitator('GET', '/supported', undefined)
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
    expect(payload.kinds.some((kind) => kind.scheme === 'x402interop-tvm')).toBe(true)
    expect(payload.kinds.some((kind) => kind.scheme === 'x402interop-lightning')).toBe(true)
  })

  it('stubs verify and settle', () => {
    expect(routeFacilitator('GET', '/verify', undefined)).toMatchObject({ status: 405 })
    expect(routeFacilitator('POST', '/verify', {}).status).toBe(400)
    expect(routeFacilitator('POST', '/settle', {}).status).toBe(400)
    expect(routeFacilitator('POST', '/verify', body)).toMatchObject({
      status: 200,
      body: { isValid: false, invalidReason: 'not_implemented' },
    })
    expect(routeFacilitator('POST', '/settle', body)).toMatchObject({
      status: 200,
      body: { success: false, errorReason: 'not_implemented', transaction: '' },
    })
    expect(routeFacilitator('GET', '/missing', undefined).status).toBe(404)
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
})
