// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { describe, expect, it } from 'vitest'

import { handleMcp, isMcpToolName, listTools, MCP_TOOL_NAMES } from '../src/index.js'

describe('mcp tools', () => {
  it('registers the six scaffold tools', () => {
    expect(MCP_TOOL_NAMES).toEqual([
      'search_services',
      'get_service',
      'prepare_payment',
      'pay_and_fetch',
      'payment_status',
      'get_credit',
    ])
    expect(listTools().map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES])
    expect(isMcpToolName('pay_and_fetch')).toBe(true)
    expect(isMcpToolName('bridge')).toBe(false)
  })

  it('answers initialize, list, and call', () => {
    expect(handleMcp('nope')).toMatchObject({ error: { code: -32600 } })
    expect(handleMcp(null)).toMatchObject({ error: { code: -32600 } })
    expect(handleMcp([])).toMatchObject({ error: { code: -32600 } })
    expect(handleMcp({ jsonrpc: '1.0', id: 1 })).toMatchObject({ error: { code: -32600 } })
    expect(handleMcp({ jsonrpc: '2.0', method: 'initialize' }).id).toBeNull()
    expect(handleMcp({ jsonrpc: '2.0', id: 'abc', method: 'initialize' }).id).toBe('abc')
    const listed = handleMcp({ jsonrpc: '2.0', id: 7, method: 'tools/list' })
    expect(listed).toMatchObject({ id: 7 })
    if (!('result' in listed)) throw new Error('expected a result')
    expect(listed.result).toMatchObject({ tools: expect.any(Array) })

    const called = handleMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'search_services', arguments: { query: 'price' } },
    })
    expect(JSON.stringify(called)).toContain('search_services')

    for (const name of MCP_TOOL_NAMES) {
      const response = handleMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name },
      })
      expect(JSON.stringify(response)).toContain(name)
    }

    expect(
      handleMcp({ jsonrpc: '2.0', id: { bad: true }, method: 'tools/call', params: { name: 1 } }),
    ).toMatchObject({ id: null, error: { code: -32602 } })
    expect(handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call' })).toMatchObject({
      error: { code: -32602 },
    })
    expect(handleMcp({ jsonrpc: '2.0', id: 1, method: 'prompts/list' })).toMatchObject({
      error: { code: -32601 },
    })
  })
})
