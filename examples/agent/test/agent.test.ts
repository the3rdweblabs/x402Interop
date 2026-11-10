// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Test the full MODE=test stack: resource service (simulated facilitator) + agent payer/payment.
describe('agent example (MODE=test)', () => {
  let baseUrl = ''
  let server: Server

  beforeAll(async () => {
    const { createResourceApp } = await import('../../resource/src/server.js')
    const { loadConfig } = await import('../../resource/src/config.js')
    const config = loadConfig({
      MODE: 'test',
      PORT: '0',
      SUI_SELLER_ADDRESS: '0x0000000000000000000000000000000000000000000000000000000000000001',
      NEAR_SELLER_ADDRESS: 'seller.test.near',
    } as NodeJS.ProcessEnv)
    const app = createResourceApp(config)
    server = app.server
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server?.close((e) => (e ? reject(e) : resolve())))
  })

  it('loads agent config defaults to Base USDC and MODE=test', async () => {
    const { loadConfig } = await import('../src/config.js')
    const cfg = loadConfig({ RESOURCE_BASE_URL: baseUrl })
    expect(cfg.MODE).toBe('test')
    expect(cfg.ORIGIN_NETWORK).toBe('eip155:8453')
    expect(cfg.ORIGIN_FAMILY).toBe('evm')
  })

  it('pays and fetches a Sui-destination resource from one EVM source wallet in test mode', async () => {
    const { loadConfig } = await import('../src/config.js')
    const { createSourcePayer } = await import('../src/payer.js')
    const { buyAndFetchResource } = await import('../src/payment.js')
    const cfg = loadConfig({
      MODE: 'test',
      RESOURCE_BASE_URL: baseUrl,
      ORIGIN_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
      MAX_SPEND_ATOMIC: '5000000',
    } as NodeJS.ProcessEnv)
    const payer = createSourcePayer(cfg)
    const result = await buyAndFetchResource('sui-usdc-report', payer, cfg)
    expect(result.ok).toBe(true)
    expect((result as any).paidFrom.singleSourceWallet).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect((result as any).paidFrom.originNetwork).toBe('eip155:8453')
    expect((result as any).paidTo.sellerNetwork).toBe('sui:mainnet')
    expect((result as any).result.content.report).toBe('sui-usdc-report')
  })

  it('pays a NEAR-destination resource from the same source wallet', async () => {
    const { loadConfig } = await import('../src/config.js')
    const { createSourcePayer } = await import('../src/payer.js')
    const { buyAndFetchResource } = await import('../src/payment.js')
    const cfg = loadConfig({
      MODE: 'test',
      RESOURCE_BASE_URL: baseUrl,
      ORIGIN_PRIVATE_KEY: `0x${'22'.repeat(32)}`,
      MAX_SPEND_ATOMIC: '5000000',
    } as NodeJS.ProcessEnv)
    const payer = createSourcePayer(cfg)
    const result = await buyAndFetchResource('near-usdc-report', payer, cfg)
    expect(result.ok).toBe(true)
    expect((result as any).paidTo.sellerNetwork).toBe('near:mainnet')
  })

  it('refuses unsupported origin families with a clear error', async () => {
    const { loadConfig } = await import('../src/config.js')
    const { createSourcePayer } = await import('../src/payer.js')
    const cfg = loadConfig({
      MODE: 'test',
      RESOURCE_BASE_URL: baseUrl,
      ORIGIN_FAMILY: 'sui',
    } as any)
    expect(() => createSourcePayer(cfg)).toThrow(/not implemented/i)
  })
})
