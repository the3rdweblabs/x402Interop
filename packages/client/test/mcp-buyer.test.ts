// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import { createMcpBuyerClient } from '../src/mcp-buyer.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function toolResponse(data: unknown, isError = false): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: 1,
    result: { isError, content: [{ type: 'text', text: JSON.stringify(data) }] },
  })
}

describe('createMcpBuyerClient', () => {
  it('calls tools and unwraps a successful result', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      toolResponse({ items: [{ id: 'report' }], account: 'buyer', spendable: '0', pending: '0' }),
    )
    const client = createMcpBuyerClient({
      url: 'http://facilitator.test/mcp',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(
      client.searchServices({ query: 'report', network: 'sui:mainnet', limit: 5 }),
    ).resolves.toMatchObject({
      items: [{ id: 'report' }],
    })
    await expect(client.getService({ serviceId: 'report' })).resolves.toBeTruthy()
    await expect(client.paymentStatus({ quoteId: 'q1' })).resolves.toBeTruthy()
    await expect(client.getCredit({ account: 'buyer' })).resolves.toMatchObject({
      spendable: '0',
      pending: '0',
    })
    await expect(
      client.payAndFetch({ paymentPayload: {}, paymentRequirements: {} }),
    ).resolves.toBeTruthy()

    const first = fetchImpl.mock.calls[0]?.[1]
    expect(JSON.parse(String(first?.body))).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'search_services',
        arguments: { query: 'report', network: 'sui:mainnet', limit: 5 },
      },
    })
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('http://facilitator.test/mcp')
  })

  it('uses global fetch when no implementation is injected', async () => {
    const original = globalThis.fetch
    globalThis.fetch = vi.fn(async () => toolResponse({ ok: true })) as unknown as typeof fetch
    try {
      const client = createMcpBuyerClient({ url: 'http://facilitator.test/mcp' })
      await expect(client.searchServices({})).resolves.toMatchObject({ ok: true })
    } finally {
      globalThis.fetch = original
    }
  })

  it('surfaces HTTP, protocol, tool, and non-JSON failures', async () => {
    const httpFail = createMcpBuyerClient({
      url: 'http://facilitator.test/mcp',
      fetchImpl: (async () => jsonResponse({ error: 'nope' }, 500)) as typeof fetch,
    })
    await expect(httpFail.callTool('ping', {})).rejects.toThrow('MCP HTTP 500')

    const rpcFail = createMcpBuyerClient({
      url: 'http://facilitator.test/mcp',
      fetchImpl: (async () =>
        jsonResponse({ error: { message: 'Unknown tool: ping' } })) as typeof fetch,
    })
    await expect(rpcFail.callTool('ping', {})).rejects.toThrow('Unknown tool: ping')

    const rpcBare = createMcpBuyerClient({
      url: 'http://facilitator.test/mcp',
      fetchImpl: (async () => jsonResponse({ error: {} })) as typeof fetch,
    })
    await expect(rpcBare.getService({ serviceId: 'missing' })).rejects.toThrow('MCP request failed')

    const toolFail = createMcpBuyerClient({
      url: 'http://facilitator.test/mcp',
      fetchImpl: (async () =>
        toolResponse({ error: 'not_found', message: 'Service not found' }, true)) as typeof fetch,
    })
    await expect(
      toolFail.preparePayment({
        serviceId: 'missing',
        buyerNetwork: 'eip155:8453',
        buyerAsset: 'usdc',
        buyerAddress: 'buyer',
      }),
    ).rejects.toThrow('Service not found')
    await expect(toolFail.payAndFetch({})).rejects.toThrow('Service not found')

    const plain = createMcpBuyerClient({
      url: 'http://facilitator.test/mcp',
      fetchImpl: (async () =>
        jsonResponse({
          result: { isError: false, content: [{ text: 'not-json' }] },
        })) as typeof fetch,
    })
    await expect(plain.callTool('get_credit', { account: 'buyer' })).resolves.toEqual({
      isError: false,
      data: 'not-json',
    })

    const empty = createMcpBuyerClient({
      url: 'http://facilitator.test/mcp',
      fetchImpl: (async () => jsonResponse({ result: { isError: false } })) as typeof fetch,
    })
    await expect(empty.paymentStatus({ quoteId: 'q1' })).resolves.toBeUndefined()
  })
})
