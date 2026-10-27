// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

export const MCP_TOOL_NAMES = [
  'search_services',
  'get_service',
  'prepare_payment',
  'pay_and_fetch',
  'payment_status',
  'get_credit',
] as const

export type McpToolName = (typeof MCP_TOOL_NAMES)[number]

export interface McpTool {
  name: McpToolName
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown> }
}

export interface JsonRpcError {
  code: number
  message: string
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | { jsonrpc: '2.0'; id: string | number | null; error: JsonRpcError }

const DESCRIPTIONS: Record<McpToolName, string> = {
  search_services: 'Find x402 services across federated catalogs',
  get_service: 'Return one service, including its schema',
  prepare_payment: 'Return payment requirements for a service without spending',
  pay_and_fetch: 'Pay for a resource and return the result or a pending handle',
  payment_status: 'Return deposit, swap, refund, or failure state for a quote',
  get_credit: 'Return spendable and pending credit for an account',
}

export function isMcpToolName(name: string): name is McpToolName {
  return (MCP_TOOL_NAMES as readonly string[]).includes(name)
}

export function listTools(): McpTool[] {
  return MCP_TOOL_NAMES.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: { type: 'object', properties: {} },
  }))
}

/** Stub result. TODO: wire search to the discovery index and payments to the facilitator. */
export function callTool(
  name: McpToolName,
  args: Record<string, unknown>,
): { content: { type: 'text'; text: string }[]; isError: false } {
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify({ tool: name, stub: true, args }) }],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Handle one MCP JSON-RPC message. `initialize`, `tools/list`, and `tools/call`
 * are implemented. Transport (stdio) is not started here.
 */
export function handleMcp(message: unknown): JsonRpcResponse {
  if (!isRecord(message) || message.jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }
  }
  const id = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null
  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'x402interop-mcp', version: '0.0.0' },
      },
    }
  }
  if (message.method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: listTools() } }
  }
  if (message.method === 'tools/call') {
    const params = isRecord(message.params) ? message.params : {}
    const name = typeof params.name === 'string' ? params.name : ''
    const args = isRecord(params.arguments) ? params.arguments : {}
    if (!isMcpToolName(name)) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } }
    }
    return { jsonrpc: '2.0', id, result: callTool(name, args) }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }
}
