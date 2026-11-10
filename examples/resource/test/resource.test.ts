// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { randomBytes, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'

import { buildEvmPaymentPayload } from '@x402interop/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildCatalog, loadConfig } from '../src/index.js'
import { createResourceApp } from '../src/server.js'

const baseEnv = {
  MODE: 'test',
  SUI_SELLER_ADDRESS: '0x0000000000000000000000000000000000000000000000000000000000000001',
  NEAR_SELLER_ADDRESS: 'seller.test.near',
  PAYMENT_REQUIRED_BODY: 'json',
} as NodeJS.ProcessEnv

describe('resource example', () => {
  it('loads config and builds catalog', () => {
    const config = loadConfig(baseEnv)
    expect(config.MODE).toBe('test')
    const catalog = buildCatalog(config)
    expect(catalog.map((r) => r.id)).toEqual(['sui-usdc-report', 'near-usdc-report'])
    expect(catalog[0]?.sellerNetwork).toBe('sui:mainnet')
    expect(catalog[1]?.sellerNetwork).toBe('near:mainnet')
  })

  it('rejects live mode without 1Click key', () => {
    expect(() => loadConfig({ ...baseEnv, MODE: 'live' })).toThrow(/ONECLICK_API_KEY/)
  })

  let baseUrl = ''
  let close: () => Promise<void>

  beforeAll(async () => {
    const config = loadConfig({ ...baseEnv, PORT: '0' })
    const { server } = createResourceApp(config)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    baseUrl = `http://127.0.0.1:${port}`
    close = () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  afterAll(async () => {
    await close?.()
  })

  it('serves catalog', async () => {
    const res = await fetch(`${baseUrl}/catalog`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.resources).toHaveLength(2)
  })

  it('returns 402 with quote for protected resource', async () => {
    const buyer = '0x2222222222222222222222222222222222222222'
    const res = await fetch(
      `${baseUrl}/r/sui-usdc-report?buyerNetwork=eip155:8453&buyerAsset=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&buyerAssetId=nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near&buyerAddress=${buyer}`,
    )
    expect(res.status).toBe(402)
    const body = (await res.json()) as any
    expect(body.x402Version).toBe(2)
    expect(body.accepts?.[0]?.scheme).toBeTruthy()
    expect(body.x402interop?.depositAddress).toBeTruthy()
  })

  it('uses the minimal x402 error body with PAYMENT-REQUIRED header', async () => {
    const config = loadConfig({ ...baseEnv, PORT: '0', PAYMENT_REQUIRED_BODY: 'error' })
    const { server } = createResourceApp(config)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/r/sui-usdc-report?buyerNetwork=eip155:8453&buyerAsset=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&buyerAssetId=nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near&buyerAddress=0x2222222222222222222222222222222222222222`,
      )
      expect(res.status).toBe(402)
      expect(await res.json()).toEqual({ error: 'Payment required' })
      const header = res.headers.get('payment-required')
      expect(header).toBeTruthy()
      const body = JSON.parse(Buffer.from(header ?? '', 'base64').toString('utf8')) as any
      expect(body.x402Version).toBe(2)
      expect(body.accepts?.[0]?.scheme).toBeTruthy()
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('returns full JSON to browsers and minimal JSON to API clients', async () => {
    const config = loadConfig({ ...baseEnv, PORT: '0', PAYMENT_REQUIRED_BODY: 'auto' })
    const { server } = createResourceApp(config)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const url = `http://127.0.0.1:${port}/r/sui-usdc-report?buyerNetwork=eip155:8453&buyerAsset=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&buyerAssetId=nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near&buyerAddress=0x2222222222222222222222222222222222222222`
    try {
      const browser = await fetch(url, { headers: { accept: 'text/html' } })
      const browserBody = (await browser.json()) as any
      expect(browser.status).toBe(402)
      expect(browserBody.x402Version).toBe(2)
      expect(browserBody.accepts?.[0]?.scheme).toBeTruthy()

      const api = await fetch(url)
      expect(api.status).toBe(402)
      expect(await api.json()).toEqual({ error: 'Payment required' })
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('settles a signed simulated payment and serves content (MODE=test stack)', async () => {
    const buyer = '0x2222222222222222222222222222222222222222'
    const challenge = await fetch(
      `${baseUrl}/r/near-usdc-report?buyerNetwork=eip155:8453&buyerAsset=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&buyerAssetId=nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near&buyerAddress=${buyer}`,
    ).then((r) => r.json() as Promise<any>)
    const requirements = challenge.accepts[0]
    const extra = requirements.extra
    const privateKey = `0x${'33'.repeat(32)}` as `0x${string}`
    const txHash = `0x${randomBytes(32).toString('hex')}`
    const binding = {
      quoteId: extra.quoteId,
      depositAddress: extra.depositAddress,
      nonce: randomUUID(),
      expiresAt: extra.expiresAt,
      originNetwork: extra.originNetwork,
      originAsset: extra.originAsset,
      originAmount: extra.originAmount,
    }
    const signed = await buildEvmPaymentPayload(
      {
        privateKey,
        depositAddress: binding.depositAddress,
        amount: binding.originAmount,
        originNetwork: binding.originNetwork,
        originAsset: binding.originAsset,
        originAmount: binding.originAmount,
        txHash,
      },
      binding,
    )
    const settlement = {
      x402Version: 2,
      paymentRequirements: requirements,
      paymentPayload: { x402Version: 2, accepted: requirements, payload: signed.payload },
    }
    const paid = await fetch(`${baseUrl}/r/near-usdc-report`, {
      headers: { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(settlement)).toString('base64') },
    })
    expect(paid.status).toBe(200)
    const body = (await paid.json()) as any
    expect(body.ok).toBe(true)
    expect(body.content.report).toBe('near-usdc-report')
    expect(body.settlement.success).toBe(true)
  })
})
