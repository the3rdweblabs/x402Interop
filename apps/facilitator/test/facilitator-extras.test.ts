// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { X402_VERSION } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import {
  FileStore,
  callTool,
  handleMcp,
  handleMcpRequest,
  isMcpToolName,
  listTools,
  supportedKinds,
} from '@x402interop/facilkit'
import { routeFacilitator } from '../src/index.js'

describe('supported kinds', () => {
  it('advertises the EVM interop scheme and omits fail-closed families', () => {
    const kinds = supportedKinds()
    const schemes = new Set(kinds.map((k) => k.scheme))
    expect(schemes).toEqual(new Set(['x402interop-evm']))
    expect(kinds[0]).toMatchObject({
      x402Version: X402_VERSION,
      scheme: 'x402interop-evm',
      network: 'eip155:8453',
    })
    for (const id of [
      'x402interop-svm',
      'x402interop-sui',
      'x402interop-aptos',
      'x402interop-stellar',
      'x402interop-starknet',
      'x402interop-utxo',
      'x402interop-lightning',
    ]) {
      expect(schemes.has(id)).toBe(false)
    }
  })
})

describe('MCP tools', () => {
  it('lists all six tools with schemas', () => {
    const tools = listTools()
    expect(tools).toHaveLength(6)
    expect(tools.map((t) => t.name)).toEqual([
      'search_services',
      'get_service',
      'prepare_payment',
      'pay_and_fetch',
      'payment_status',
      'get_credit',
    ])
  })

  it('recognises exactly the six tool names', () => {
    expect(isMcpToolName('pay_and_fetch')).toBe(true)
    expect(isMcpToolName('nope')).toBe(false)
  })

  it('refuses tool calls that are not bound to a facilitator', async () => {
    for (const name of listTools()) {
      const out = await callTool(name.name, { x: 1 })
      expect(out.isError).toBe(true)
    }
  })

  it('handles initialize, tools/list, tools/call, ping, and errors', async () => {
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
      await handleMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'payment_status', arguments: { quoteId: 'q1' } },
      }),
    ).toMatchObject({ result: { isError: true } })
    expect(await handleMcp({ jsonrpc: '2.0', id: 'abc', method: 'ping' })).toMatchObject({
      result: {},
    })
    expect(await handleMcp({ jsonrpc: '2.0', id: 1, method: 'unknown' })).toMatchObject({
      error: { code: -32601 },
    })
    expect(
      await handleMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 5, arguments: {} },
      }),
    ).toMatchObject({
      error: { code: -32602 },
    })
    expect(await handleMcp({ jsonrpc: '2.0', id: true, method: 'ping' })).toMatchObject({
      id: null,
      result: {},
    })
    expect(
      await handleMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'payment_status', arguments: 'not-an-object' },
      }),
    ).toMatchObject({ id: 1, result: { isError: true } })
  })

  it('routes MCP requests with a parse-error fallback', async () => {
    expect(await handleMcpRequest('{broken')).toMatchObject({
      status: 400,
      body: { error: { code: -32700 } },
    })
    expect(
      await handleMcpRequest(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })),
    ).toMatchObject({ status: 200, body: { result: {} } })
  })
})

describe('FileStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'facilitator-store-'))

  it('persists quotes, nonces, and deposit mappings', () => {
    const file = join(dir, 'store.json')
    const store = new FileStore(file)
    expect(store.getQuote('q1')).toBeUndefined()
    store.saveQuote('q1', { quoteId: 'q1' })
    store.addNonce('n1')
    store.addNonce('n1') // idempotent
    store.saveDepositMapping('q1', '0x1111111111111111111111111111111111111111')
    expect(store.getQuote('q1')).toEqual({ quoteId: 'q1' })
    expect(store.hasNonce('n1')).toBe(true)
    expect(store.getDepositAddress('q1')).toBe('0x1111111111111111111111111111111111111111')

    const reloaded = new FileStore(file)
    expect(reloaded.getQuote('q1')).toEqual({ quoteId: 'q1' })
    expect(reloaded.hasNonce('n1')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('falls back to empty state on a corrupt file', () => {
    const file = join(dir, 'corrupt.json')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, '{not json')
    const store = new FileStore(file)
    expect(store.getQuote('x')).toBeUndefined()
    expect(store.hasNonce('x')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('route nonce handling', () => {
  const requirements = {
    scheme: 'x402interop-evm',
    network: 'eip155:8453',
    asset: 'usdc',
    amount: '50000',
    payTo: '0x1111111111111111111111111111111111111111',
    maxTimeoutSeconds: 300,
  }

  function nonceBody(nonce: string) {
    return {
      x402Version: X402_VERSION,
      paymentRequirements: requirements,
      paymentPayload: {
        x402Version: X402_VERSION,
        accepted: requirements,
        payload: {
          binding: {
            quoteId: 'q-nonce',
            depositAddress: '0x1111111111111111111111111111111111111111',
            nonce,
            expiresAt: '2026-10-31T12:05:00Z',
          },
        },
      },
    }
  }

  it('does not consume a nonce when settlement fails closed', async () => {
    const settle = await routeFacilitator('POST', '/settle', nonceBody('nonce-settle-once'))
    expect(settle.body).toMatchObject({ success: false, errorReason: 'not_implemented' })
    const reuse = await routeFacilitator('POST', '/verify', nonceBody('nonce-settle-once'))
    expect(reuse.body).toMatchObject({ isValid: false, invalidReason: 'not_implemented' })
  })
})
