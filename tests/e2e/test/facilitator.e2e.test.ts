// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createHash, randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { buildEvmPaymentPayload } from '@x402interop/client'
import { X402_VERSION } from '@x402interop/core'
import { createFacilitatorServer } from 'facilitator'
import { privateKeyToAccount } from 'viem/accounts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FACILITATOR_ROUTES, isFacilitatorRoute } from '../src/index.js'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const TEST_KEY = testPrivateKeyOrPlaceholder()
const HAS_TEST_KEY = hasTestPrivateKey()
const TEST_ADDRESS = privateKeyToAccount(TEST_KEY).address

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
    expect(supportedBody.kinds.some((kind) => kind.scheme === 'x402interop-evm')).toBe(true)
    expect(supportedBody.kinds.some((kind) => kind.scheme === 'x402interop-sui')).toBe(false)
    expect(supportedBody.kinds.some((kind) => kind.scheme === 'x402interop-aptos')).toBe(false)

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

  it.skipIf(!HAS_TEST_KEY)(
    'quotes, signs, verifies, settles, and reaches SUCCESS over HTTP',
    async () => {
      const quoted = await fetch(`${base}/interop/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sellerNetwork: 'sui:mainnet',
          sellerAsset: 'usdc',
          sellerAddress: 'seller',
          amount: '50000',
          buyerNetwork: 'eip155:8453',
          buyerAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          buyerAddress: TEST_ADDRESS,
          deliveryMode: 'on_deposit',
        }),
      })
      expect(quoted.status).toBe(200)
      const quote = (await quoted.json()) as Record<string, any>
      const requirements = {
        scheme: quote.scheme,
        network: quote.network,
        asset: quote.asset,
        amount: quote.amount,
        payTo: quote.payTo,
        maxTimeoutSeconds: quote.maxTimeoutSeconds,
        extra: quote.extra,
      }
      const txHash = `0x${createHash('sha256').update(String(quote.quoteId)).digest('hex')}`
      const signed = await buildEvmPaymentPayload(
        {
          privateKey: TEST_KEY,
          depositAddress: String(quote.depositAddress),
          amount: String(quote.extra.originAmount),
          originNetwork: String(quote.extra.originNetwork),
          originAsset: String(quote.extra.originAsset),
          originAmount: String(quote.extra.originAmount),
          txHash,
        },
        {
          quoteId: String(quote.quoteId),
          depositAddress: String(quote.depositAddress),
          nonce: randomUUID(),
          expiresAt: String(quote.extra.expiresAt),
          originNetwork: String(quote.extra.originNetwork),
          originAsset: String(quote.extra.originAsset),
          originAmount: String(quote.extra.originAmount),
        },
      )
      const body = JSON.stringify({
        x402Version: X402_VERSION,
        paymentRequirements: requirements,
        paymentPayload: {
          x402Version: X402_VERSION,
          accepted: requirements,
          payload: signed.payload,
        },
      })
      const verified = await fetch(`${base}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      expect(await verified.json()).toMatchObject({
        isValid: true,
        extra: { swapStatus: 'SUCCESS' },
      })
      const settled = await fetch(`${base}/settle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      expect(await settled.json()).toMatchObject({ success: true })
      const tracked = await fetch(`${base}/interop/status/${quote.quoteId}`)
      expect(await tracked.json()).toMatchObject({ state: 'success' })
    },
  )
})
