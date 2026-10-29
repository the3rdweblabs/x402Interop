// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { Server } from 'node:http'

import { X402_VERSION } from '@x402interop/core'
import { createFacilitatorServer } from 'facilitator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FACILITATOR_ROUTES, isFacilitatorRoute } from '../src/index.js'

describe('facilitator e2e', () => {
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

  it('exposes health, supported, verify, settle, and interop', async () => {
    expect(FACILITATOR_ROUTES.every((route) => isFacilitatorRoute(route))).toBe(true)
    expect(isFacilitatorRoute('/quote')).toBe(false)

    const health = await fetch(`${base}/health`)
    expect(health.status).toBe(200)

    const supported = await fetch(`${base}/supported`)
    const supportedBody = (await supported.json()) as { kinds: { scheme: string }[] }
    expect(supportedBody.kinds.some((kind) => kind.scheme === 'x402interop-sui')).toBe(true)

    const requirements = {
      scheme: 'x402interop-evm',
      network: 'sui:mainnet',
      asset: 'usdc',
      amount: '50000',
      payTo: 'seller',
      maxTimeoutSeconds: 300,
    }
    const payload = {
      x402Version: X402_VERSION,
      paymentRequirements: requirements,
      paymentPayload: { x402Version: X402_VERSION, accepted: requirements, payload: {} },
    }
    const verified = await fetch(`${base}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(await verified.json()).toMatchObject({ invalidReason: 'not_implemented' })

    const settled = await fetch(`${base}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(await settled.json()).toMatchObject({ success: false, transaction: '' })

    const quote = await fetch(`${base}/interop/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sellerNetwork: 'sui:mainnet',
        sellerAsset: 'usdc',
        sellerAddress: 'seller',
        amount: '50000',
        buyerNetwork: 'eip155:8453',
        buyerAsset: 'usdc',
        buyerAddress: 'buyer',
        deliveryMode: 'on_deposit',
      }),
    })
    expect(quote.status).toBe(200)
    const quoteBody = (await quote.json()) as any
    expect(quoteBody.quoteId).toBeTruthy()
    const status = await fetch(`${base}/interop/status/${quoteBody.quoteId}`)
    expect(status.status).toBe(200)
  })
})
