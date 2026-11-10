// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  FileStore,
  MemoryStatusTracker,
  createInteropFacilitator,
  createMarketplaceAuthenticator,
  createUpstreamListingPaymentProcessor,
  callTool,
  handleMcp,
  handleMcpRequest,
  isMcpToolName,
  isTerminal,
  listTools,
  supportedKinds,
  supportedResponse,
} from '../src/index.js'
import type { CreateInteropFacilitatorOptions } from '../src/facilitator.js'
import type {
  OneClickClient,
  OneClickQuote,
  OneClickStatus,
  OneClickDepositAck,
} from '@x402interop/intents'

describe('status tracker', () => {
  it('categorises terminal states', () => {
    expect(isTerminal('success')).toBe(true)
    expect(isTerminal('refunded')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('pending_deposit')).toBe(false)
  })

  it('records, lists, and sticks terminal states', () => {
    const tracker = new MemoryStatusTracker()
    expect(tracker.get('q1')).toBeUndefined()
    tracker.record({ quoteId: 'q1', state: 'pending_deposit', originTxHash: '0x1' })
    const updated = tracker.record({ quoteId: 'q1', state: 'processing' })
    expect(updated.originTxHash).toBe('0x1')
    tracker.record({ quoteId: 'q1', state: 'refunded' })
    const terminal = tracker.record({
      quoteId: 'q1',
      state: 'processing',
      destinationTxHash: '0x2',
    })
    expect(terminal.state).toBe('refunded')
    expect(terminal.destinationTxHash).toBeUndefined()
    tracker.record({ quoteId: 'q2', state: 'pending_deposit', destinationTxHash: '0xd2' })
    expect(tracker.record({ quoteId: 'q2', state: 'processing' }).destinationTxHash).toBe('0xd2')
    tracker.record({ quoteId: 'q2', state: 'success' })
    expect(tracker.record({ quoteId: 'q2', state: 'failed' }).state).toBe('success')
    expect(tracker.list()).toHaveLength(2)
  })
})

describe('http helpers', () => {
  it('normalises methods and paths', async () => {
    const { methodOf, requestPath } = await import('../src/index.js')
    expect(methodOf(undefined)).toBe('GET')
    expect(methodOf('POST')).toBe('POST')
    expect(requestPath(undefined)).toBe('/')
    expect(requestPath('')).toBe('/')
    expect(requestPath('/health?x=1')).toBe('/health')
    expect(requestPath('?')).toBe('/')
    expect(requestPath('/health')).toBe('/health')
  })
})

describe('MCP surface', () => {
  it('lists the six tools and refuses a call with no facilitator', async () => {
    const tools = listTools()
    expect(tools).toHaveLength(6)
    for (const tool of tools) {
      expect(isMcpToolName(tool.name)).toBe(true)
      expect(tool.inputSchema.type).toBe('object')
      const result = await callTool(tool.name, {})
      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('facilitator_unavailable')
    }
    expect(isMcpToolName('nope')).toBe(false)
    expect(listTools().find((tool) => tool.name === 'get_service')?.inputSchema.required).toEqual([
      'serviceId',
    ])
  })

  it('handles initialize, tools, calls, ping, and errors', async () => {
    expect(await handleMcp(null)).toMatchObject({ error: { code: -32600 } })
    expect(await handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize' })).toMatchObject({
      result: { serverInfo: { name: 'x402interop-facilitator-mcp' } },
    })
    expect(await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toMatchObject({
      result: { tools: expect.any(Array) },
    })
    expect(
      await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'bogus' } }),
    ).toMatchObject({ error: { code: -32602 } })
    expect(
      await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ping' } }),
    ).toMatchObject({ error: { code: -32602 } })
    expect(await handleMcp({ jsonrpc: '2.0', id: 'z', method: 'ping' })).toMatchObject({
      result: {},
    })
    expect(
      await handleMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 42, arguments: {} },
      }),
    ).toMatchObject({
      error: { code: -32602 },
    })
    expect(
      await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ping' } }),
    ).toMatchObject({
      error: { code: -32602 },
    })
    expect(await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toMatchObject({})

    expect(await handleMcp({ jsonrpc: '2.0', id: 1, method: 'wat' })).toMatchObject({
      error: { code: -32601 },
    })
  })

  it('parses MCP request bodies with a parse-error fallback', async () => {
    expect(await handleMcpRequest('{nope')).toMatchObject({
      status: 400,
      body: { error: { code: -32700 } },
    })
    expect(await handleMcpRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}')).toMatchObject({
      status: 200,
      body: { result: {} },
    })
  })
})

describe('supported kinds', () => {
  it('advertises only families whose origin proof verifies', () => {
    const kinds = supportedKinds()
    const schemes = new Set(kinds.map((k) => k.scheme))
    expect(schemes).toEqual(new Set(['x402interop-evm']))
    expect(kinds[0]).toMatchObject({
      x402Version: 2,
      scheme: 'x402interop-evm',
      network: 'eip155:8453',
    })
    expect(kinds.some((k) => k.network === 'lnbtc:000000000019d6689c085ae165831e93')).toBe(false)
    expect(kinds.some((k) => k.scheme === 'x402interop-aptos')).toBe(false)
    expect(kinds.some((k) => k.scheme === 'x402interop-utxo')).toBe(false)
    const response = supportedResponse(kinds)
    expect(response.extensions).toEqual(['x402interop'])
    expect(response.signers).toEqual({})
  })
})

describe('FileStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'facilkit-store-'))

  it('persists quotes, nonces, and deposit mappings across reloads', () => {
    const file = join(dir, 'store.json')
    const store = new FileStore(file)
    store.saveQuote('q1', { quoteId: 'q1' })
    store.addNonce('n1')
    store.addNonce('n1')
    store.saveDepositMapping('q1', '0x1111111111111111111111111111111111111111')
    expect(store.getQuote('q1')).toEqual({ quoteId: 'q1' })
    expect(store.hasNonce('n1')).toBe(true)
    expect(store.getDepositAddress('q1')).toBe('0x1111111111111111111111111111111111111111')
    const reloaded = new FileStore(file)
    expect(reloaded.getQuote('q1')).toEqual({ quoteId: 'q1' })
    expect(reloaded.hasNonce('n1')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('starts empty on a corrupt file', () => {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'corrupt.json')
    writeFileSync(file, '{broken')
    const store = new FileStore(file)
    expect(store.getQuote('x')).toBeUndefined()
    expect(store.hasNonce('x')).toBe(false)
    store.saveQuote('patched', { quoteId: 'patched' })
    expect(new FileStore(file).getQuote('patched')).toEqual({ quoteId: 'patched' })
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('createInteropFacilitator routes', () => {
  const facilitator = createInteropFacilitator()

  it('serves health and supported kinds', async () => {
    expect(await facilitator.routeFacilitator('GET', '/health', undefined)).toMatchObject({
      status: 200,
      body: { status: 'ok', service: 'facilitator' },
    })
    expect(await facilitator.routeFacilitator('GET', '/supported', undefined)).toMatchObject({
      status: 200,
      body: { extensions: ['x402interop'] },
    })
  })

  it('protects marketplace writes and supports API-key ownership', async () => {
    const secured = createInteropFacilitator({
      marketplaceAuthenticator: createMarketplaceAuthenticator({
        apiKeys: { 'test-key': 'seller-owner' },
      }),
      marketplaceFees: {
        registration: [
          { network: 'eip155:8453', asset: 'usdc', amount: '100000', treasury: '0xtreasury' },
        ],
        featured: { '30d': [], '60d': [] },
      },
      listingPaymentProcessor: {
        async settle() {
          return { success: true, transaction: '0xfee' }
        },
      },
    })
    const input = {
      name: 'Weather API',
      description: 'Current weather',
      price: '0.01',
      networks: ['eip155:8453'],
      asset: 'usdc',
      owner: 'seller-owner',
      resourceUrl: 'https://example.com/weather',
    }
    expect(await secured.routeFacilitator('POST', '/discovery/resources', input)).toMatchObject({
      status: 401,
      body: { error: 'authentication_required' },
    })
    expect(
      await secured.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...input, paymentNetwork: 'eip155:8453', paymentAsset: 'usdc' },
        { authorization: 'Bearer test-key', 'payment-signature': 'signed-fee' },
      ),
    ).toMatchObject({
      status: 201,
      body: { resource: { owner: 'seller-owner' }, transaction: '0xfee' },
    })
    expect(
      await secured.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...input, owner: 'other' },
        {
          authorization: 'Bearer test-key',
        },
      ),
    ).toMatchObject({ status: 403, body: { error: 'owner_mismatch' } })
  })

  it('supports owner updates, health checks, and deletion', async () => {
    const secured = createInteropFacilitator({
      marketplaceAuthenticator: createMarketplaceAuthenticator({
        apiKeys: { 'test-key': 'seller-owner' },
      }),
      marketplaceFees: {
        registration: [
          { network: 'eip155:8453', asset: 'usdc', amount: '100000', treasury: '0xtreasury' },
        ],
        featured: { '30d': [], '60d': [] },
      },
      listingPaymentProcessor: {
        async settle() {
          return { success: true, transaction: '0xfee' }
        },
      },
      serviceHealthChecker: async () => ({ health: 'healthy', message: 'HTTP 402' }),
    })

    const headers = { authorization: 'Bearer test-key' }
    const input = {
      name: 'Weather API',
      description: 'Current weather',
      price: '0.01',
      networks: ['eip155:8453'],
      asset: 'usdc',
      owner: 'seller-owner',
      resourceUrl: 'https://example.com/weather',
    }
    await secured.routeFacilitator(
      'POST',
      '/discovery/resources',
      { ...input, paymentNetwork: 'eip155:8453', paymentAsset: 'usdc' },
      { ...headers, 'payment-signature': 'signed-fee' },
    )
    const updated = await secured.routeFacilitator(
      'PATCH',
      '/discovery/resources/weather-api',
      { description: 'Updated weather' },
      headers,
    )
    expect(updated).toMatchObject({
      status: 200,
      body: { resource: { description: 'Updated weather' } },
    })
    const checked = await secured.routeFacilitator(
      'POST',
      '/discovery/resources/weather-api/health',
      undefined,
      headers,
    )
    expect(checked).toMatchObject({
      status: 200,
      body: { resource: { health: 'healthy', healthMessage: 'HTTP 402' } },
    })
    expect(
      await secured.routeFacilitator(
        'DELETE',
        '/discovery/resources/weather-api',
        undefined,
        headers,
      ),
    ).toMatchObject({ status: 200, body: { ok: true } })
    expect(
      await secured.routeFacilitator('GET', '/discovery/resources/weather-api', undefined),
    ).toMatchObject({ status: 404 })
  })

  it('rejects malformed listing payment headers through the upstream processor', async () => {
    const processor = createUpstreamListingPaymentProcessor(async () => ({
      success: false,
      errorReason: 'invalid_request',
      errorMessage: 'bad payload',
      transaction: '',
      network: 'eip155:8453',
    }))
    await expect(
      processor.settle({
        paymentSignature: 'not-base64-json',
        paymentRequirements: {
          network: 'eip155:8453',
          asset: 'usdc',
          amount: '100000',
          treasury: '0xtreasury',
        },
        resource: '/discovery/resources',
        metadata: {},
      }),
    ).resolves.toEqual({ success: false, reason: 'Invalid PAYMENT-SIGNATURE header' })
  })

  it('only accepts a non-empty upstream settlement transaction', async () => {
    const processor = createUpstreamListingPaymentProcessor(async () => ({
      success: true,
      transaction: '',
      network: 'eip155:8453',
      amount: '100000',
      payer: '0xpayer',
    }))
    const paymentSignature = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        accepted: {
          scheme: 'exact',
          network: 'eip155:8453',
          asset: 'usdc',
          amount: '100000',
          payTo: '0xtreasury',
          maxTimeoutSeconds: 300,
          extra: {},
        },
        payload: {},
      }),
    ).toString('base64')
    await expect(
      processor.settle({
        paymentSignature,
        paymentRequirements: {
          network: 'eip155:8453',
          asset: 'usdc',
          amount: '100000',
          treasury: '0xtreasury',
        },
        resource: '/discovery/resources',
        metadata: {},
      }),
    ).resolves.toEqual({ success: false, reason: 'Listing fee payment was rejected' })
  })

  it('stubs verify and settle requests', async () => {
    expect(await facilitator.routeFacilitator('GET', '/verify', undefined)).toMatchObject({
      status: 405,
    })
    expect(await facilitator.routeFacilitator('POST', '/verify', {})).toMatchObject({ status: 400 })
    expect(await facilitator.routeFacilitator('POST', '/verify', undefined)).toMatchObject({
      status: 400,
    })
    expect(await facilitator.routeFacilitator('GET', '/missing', undefined)).toMatchObject({
      status: 404,
    })
  })

  it('mints an interop quote end to end', async () => {
    const result = await facilitator.routeFacilitator('POST', '/interop/quote', {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '50000',
      buyerNetwork: 'eip155:8453',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    })
    expect(result.status).toBe(200)
    const body = result.body as {
      scheme: string
      quoteId: string
      depositAddress: string
      extensions: { x402interop?: { info?: { quoteId: string } } }
    }
    expect(body.scheme).toBe('x402interop-evm')
    expect(body.quoteId).toBeTruthy()
    expect(body.depositAddress).toBeTruthy()
    expect(body.extensions.x402interop?.info?.quoteId).toBe(body.quoteId)
    const status = await facilitator.routeFacilitator(
      'GET',
      `/interop/status/${body.quoteId}`,
      undefined,
    )
    expect(status.status).toBe(200)
    expect((status.body as { quoteId: string }).quoteId).toBe(body.quoteId)
  })

  it('serves MCP listing and RPC routes', async () => {
    expect(await facilitator.routeFacilitator('GET', '/mcp', undefined)).toMatchObject({
      status: 200,
      body: { serverInfo: { name: 'x402interop-facilitator-mcp' } },
    })
    expect(await facilitator.routeFacilitator('GET', '/mcp/tools', undefined)).toMatchObject({
      status: 200,
      body: { result: { tools: expect.any(Array) } },
    })
    expect(await facilitator.routeFacilitator('GET', '/.well-known/mcp', undefined)).toMatchObject({
      status: 200,
      body: { result: { tools: expect.any(Array) } },
    })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/mcp',
        '{"jsonrpc":"2.0","id":1,"method":"ping"}',
      ),
    ).toMatchObject({ status: 200, body: { result: {} } })
    expect(
      await facilitator.routeFacilitator('POST', '/mcp/rpc', {
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
      }),
    ).toMatchObject({ status: 200, body: { result: {} } })
  })

  it('fails closed without an origin-chain verifier and does not consume the nonce', async () => {
    const body = {
      x402Version: 2,
      paymentRequirements: {
        scheme: 'x402interop-evm',
        network: 'eip155:8453',
        asset: 'usdc',
        amount: '50000',
        payTo: '0x1111111111111111111111111111111111111111',
        maxTimeoutSeconds: 300,
        extra: {},
      },
      paymentPayload: {
        x402Version: 2,
        accepted: {
          scheme: 'x402interop-evm',
          network: 'eip155:8453',
          asset: 'usdc',
          amount: '50000',
          payTo: '0x1111111111111111111111111111111111111111',
          maxTimeoutSeconds: 300,
          extra: {},
        },
        payload: {
          binding: {
            quoteId: 'qk',
            depositAddress: '0x1111111111111111111111111111111111111111',
            nonce: `k-nonce-${Date.now()}`,
            expiresAt: '2026-11-01T00:00:00.000Z',
          },
        },
      },
    }
    const settled = await facilitator.routeFacilitator('POST', '/settle', body)
    expect(settled.body).toMatchObject({ success: false, errorReason: 'not_implemented' })
    const retried = await facilitator.routeFacilitator('POST', '/verify', body)
    expect(retried.body).toMatchObject({ isValid: false, invalidReason: 'not_implemented' })
  })
})

describe('createInteropFacilitator resilience', () => {
  function failingQuotes(overrides: Partial<OneClickClient> = {}): OneClickClient {
    return {
      async quote(): Promise<OneClickQuote> {
        throw new Error('1click down')
      },
      async status(depositAddress: string): Promise<OneClickStatus> {
        return { status: 'SUCCESS', depositAddress }
      },
      async submitDeposit(): Promise<OneClickDepositAck> {
        return { accepted: true }
      },
      ...overrides,
    }
  }

  const facilitator = createInteropFacilitator({ intentsClient: failingQuotes() })

  it('fails closed when 1Click is unreachable', async () => {
    const result = await facilitator.routeFacilitator('POST', '/interop/quote', {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '50000',
      buyerNetwork: 'sui:mainnet',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    })
    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ error: 'quote_unavailable' })
  })

  it('maps a live SUCCESS status onto the tracked swap', async () => {
    const liveFacilitator = createInteropFacilitator({
      intentsClient: {
        async quote(): Promise<OneClickQuote> {
          return {
            quoteId: 'q-live-success',
            depositAddress: '0x-live-success',
            originAmount: '50000',
            destinationAmount: '50000',
            timeEstimateSeconds: 1,
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          }
        },
        async status(depositAddress: string): Promise<OneClickStatus> {
          return { status: 'SUCCESS', depositAddress }
        },
        async submitDeposit(): Promise<OneClickDepositAck> {
          return { accepted: true }
        },
      },
    })
    const quoted = await liveFacilitator.routeFacilitator('POST', '/interop/quote', {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '50000',
      buyerNetwork: 'eip155:8453',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    })
    const id = (quoted.body as { quoteId: string }).quoteId
    const status = await liveFacilitator.routeFacilitator('GET', `/interop/status/${id}`, undefined)
    expect(status.status).toBe(200)
    expect((status.body as { state: string }).state).toBe('success')
  })

  it('forwards a quote deposit memo to the status lookup', async () => {
    const status = vi.fn(async (depositAddress: string): Promise<OneClickStatus> => ({
      status: 'SUCCESS',
      depositAddress,
    }))
    const memoFacilitator = createInteropFacilitator({
      intentsClient: {
        async quote(): Promise<OneClickQuote> {
          return {
            quoteId: 'q-memo',
            depositAddress: '0x-memo',
            depositMemo: 'memo-1',
            originAmount: '50000',
            destinationAmount: '50000',
            timeEstimateSeconds: 1,
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          }
        },
        status,
        async submitDeposit(): Promise<OneClickDepositAck> {
          return { accepted: true }
        },
      },
    })
    const quoted = await memoFacilitator.routeFacilitator('POST', '/interop/quote', {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '50000',
      buyerNetwork: 'eip155:8453',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    })
    const id = (quoted.body as { quoteId: string }).quoteId
    await memoFacilitator.routeFacilitator('GET', `/interop/status/${id}`, undefined)
    expect(status).toHaveBeenCalledWith('0x-memo', 'memo-1')
  })
})

describe('createInteropFacilitator route branches', () => {
  const listing = {
    name: 'Branch API',
    description: 'Branch coverage service',
    price: '0.01',
    networks: ['eip155:8453'],
    asset: 'usdc',
    category: 'api',
    owner: 'branch-owner',
    resourceUrl: 'https://branch.example.test',
  }

  function secured(
    options: {
      healthChecker?: CreateInteropFacilitatorOptions['serviceHealthChecker']
      processor?: CreateInteropFacilitatorOptions['listingPaymentProcessor']
    } = {},
  ) {
    return createInteropFacilitator({
      store: new FileStore(join(mkdtempSync(join(tmpdir(), 'facilkit-route-')), 'store.json')),
      marketplaceAuthenticator: createMarketplaceAuthenticator({
        apiKeys: { 'branch-key': 'branch-owner' },
      }),
      marketplaceFees: {
        registration: [
          { network: 'eip155:8453', asset: 'usdc', amount: '100000', treasury: '0xtreasury' },
        ],
        featured: { '30d': [], '60d': [] },
      },
      listingPaymentProcessor: options.processor ?? {
        async settle() {
          return { success: true, transaction: '0xbranch' }
        },
      },
      serviceHealthChecker: options.healthChecker,
    })
  }

  it('serves marketplace fees, discovery queries, and registration payment branches', async () => {
    const unconfigured = createInteropFacilitator()
    expect(
      await unconfigured.routeFacilitator('GET', '/marketplace/fees', undefined),
    ).toMatchObject({
      status: 503,
      body: { error: 'fees_unavailable' },
    })

    const facilitator = secured()
    const headers = { authorization: 'Bearer branch-key' }
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...listing, paymentNetwork: 'eip155:8453', paymentAsset: 'unsupported' },
        headers,
      ),
    ).toMatchObject({ status: 400, body: { error: 'unsupported_fee_asset' } })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...listing, paymentNetwork: 'eip155:8453', paymentAsset: 'usdc' },
        headers,
      ),
    ).toMatchObject({ status: 402, body: { error: 'payment_required' } })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...listing, paymentNetwork: 'eip155:8453', paymentAsset: 'usdc' },
        { ...headers, 'payment-signature': 'fee-signature' },
      ),
    ).toMatchObject({ status: 201 })
    expect(
      await facilitator.routeFacilitator(
        'GET',
        '/discovery/resources?q=branch&network=eip155%3A8453&asset=usdc&category=api&maxPrice=1&owner=branch-owner&limit=2&offset=0',
        undefined,
      ),
    ).toMatchObject({ status: 200, body: { total: 1, limit: 2, offset: 0 } })
    expect(
      await facilitator.routeFacilitator('GET', '/discovery/merchants', undefined),
    ).toMatchObject({
      status: 200,
      body: { merchants: expect.any(Array) },
    })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...listing, id: 'branch-api-2', paymentNetwork: 'eip155:8453', paymentAsset: 'usdc' },
        { ...headers, 'PAYMENT-SIGNATURE': 'fee-signature' },
      ),
    ).toMatchObject({ status: 201 })
    expect(
      await facilitator.routeFacilitator(
        'PATCH',
        '/discovery/resources/branch-api-2',
        { price: '' },
        headers,
      ),
    ).toMatchObject({ status: 400, body: { error: 'invalid_service' } })
  })

  it('uses the default health checker for healthy, unhealthy, and failed services', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 402 })
      .mockResolvedValueOnce({ status: 500 })
      .mockRejectedValueOnce(new Error('health unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    const facilitator = secured()
    const headers = { authorization: 'Bearer branch-key' }
    for (const id of ['healthy-service', 'unhealthy-service', 'failed-service']) {
      expect(
        await facilitator.routeFacilitator(
          'POST',
          '/discovery/resources',
          { ...listing, id, paymentNetwork: 'eip155:8453', paymentAsset: 'usdc' },
          { ...headers, 'payment-signature': `fee-${id}` },
        ),
      ).toMatchObject({ status: 201 })
    }
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources/healthy-service/health',
        undefined,
        headers,
      ),
    ).toMatchObject({
      status: 200,
      body: { resource: { health: 'healthy', healthMessage: 'HTTP 402' } },
    })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources/unhealthy-service/health',
        undefined,
        headers,
      ),
    ).toMatchObject({
      status: 200,
      body: { resource: { health: 'unhealthy', healthMessage: 'HTTP 500' } },
    })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources/failed-service/health',
        undefined,
        headers,
      ),
    ).toMatchObject({
      status: 200,
      body: { resource: { health: 'unhealthy', healthMessage: 'health unavailable' } },
    })
    vi.unstubAllGlobals()
  })

  it('returns tracked status when the status provider fails or has no mapping', async () => {
    const statuses: OneClickStatus['status'][] = [
      'PENDING_DEPOSIT',
      'KNOWN_DEPOSIT_TX',
      'PROCESSING',
      'SUCCESS',
      'INCOMPLETE_DEPOSIT',
      'REFUNDED',
      'FAILED',
    ]
    for (const status of statuses) {
      const facilitator = createInteropFacilitator({
        intentsClient: {
          async quote(): Promise<OneClickQuote> {
            return {
              quoteId: `q-${status}`,
              depositAddress: `deposit-${status}`,
              originAmount: '1',
              destinationAmount: '1',
              timeEstimateSeconds: 1,
              expiresAt: new Date(Date.now() + 300000).toISOString(),
            }
          },
          async status(depositAddress: string): Promise<OneClickStatus> {
            return { status, depositAddress }
          },
          async submitDeposit(): Promise<OneClickDepositAck> {
            return { accepted: true }
          },
        },
      })
      const quote = await facilitator.routeFacilitator('POST', '/interop/quote', {
        sellerNetwork: 'sui:mainnet',
        sellerAsset: 'usdc',
        sellerAddress: 'seller',
        amount: '1',
        buyerNetwork: 'eip155:8453',
        buyerAsset: 'usdc',
        buyerAddress: 'buyer',
        deliveryMode: 'on_deposit',
      })
      const id = (quote.body as { quoteId: string }).quoteId
      expect(
        await facilitator.routeFacilitator('GET', `/interop/status/${id}`, undefined),
      ).toMatchObject({
        status: 200,
      })
    }
    const failing = createInteropFacilitator({
      intentsClient: {
        async quote(): Promise<OneClickQuote> {
          return {
            quoteId: 'q-status-fail',
            depositAddress: 'deposit-status-fail',
            originAmount: '1',
            destinationAmount: '1',
            timeEstimateSeconds: 1,
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          }
        },
        async status(): Promise<OneClickStatus> {
          throw new Error('status unavailable')
        },
        async submitDeposit(): Promise<OneClickDepositAck> {
          return { accepted: true }
        },
      },
    })
    const quote = await failing.routeFacilitator('POST', '/interop/quote', {
      sellerNetwork: 'sui:mainnet',
      sellerAsset: 'usdc',
      sellerAddress: 'seller',
      amount: '1',
      buyerNetwork: 'eip155:8453',
      buyerAsset: 'usdc',
      buyerAddress: 'buyer',
      deliveryMode: 'on_deposit',
    })
    const id = (quote.body as { quoteId: string }).quoteId
    expect(await failing.routeFacilitator('GET', `/interop/status/${id}`, undefined)).toMatchObject(
      {
        status: 200,
        body: { state: 'pending_deposit' },
      },
    )
    expect(
      await failing.routeFacilitator('GET', '/interop/status/missing', undefined),
    ).toMatchObject({
      status: 404,
    })
  })
})
