// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * MCP tools for discovery and payment.
 *
 * Trust: this process never accepts a buyer private key, seed, or mnemonic.
 * `prepare_payment` returns a quote. The caller signs it (the client package
 * can build an EIP-712 payload) and passes the signed payload to
 * `pay_and_fetch`. A field that looks like a key is rejected before any
 * handler runs.
 */

import { z } from 'zod'

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
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

export interface JsonRpcError {
  code: number
  message: string
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | { jsonrpc: '2.0'; id: string | number | null; error: JsonRpcError }

export interface McpToolResult {
  content: { type: 'text'; text: string }[]
  isError: boolean
}

export type McpHandlerOutcome =
  { isError: false; data: unknown } | { isError: true; error: string; message: string }

export interface McpToolHandlers {
  search_services(args: SearchServicesArgs): Promise<McpHandlerOutcome>
  get_service(args: GetServiceArgs): Promise<McpHandlerOutcome>
  prepare_payment(args: PreparePaymentArgs): Promise<McpHandlerOutcome>
  pay_and_fetch(args: PayAndFetchArgs): Promise<McpHandlerOutcome>
  payment_status(args: PaymentStatusArgs): Promise<McpHandlerOutcome>
  get_credit(args: GetCreditArgs): Promise<McpHandlerOutcome>
}

const searchServicesSchema = z.object({
  query: z.string().optional(),
  network: z.string().min(1).optional(),
  asset: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  maxPrice: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional(),
  owner: z.string().min(1).optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
})

const getServiceSchema = z.object({
  serviceId: z.string().min(1),
})

const preparePaymentSchema = z.object({
  serviceId: z.string().min(1),
  buyerNetwork: z.string().min(1),
  buyerAsset: z.string().min(1),
  buyerAddress: z.string().min(1),
  buyerAssetId: z.string().min(1).optional(),
  sellerNetwork: z.string().min(1).optional(),
  /** Atomic destination amount. Required when the listing price is not an integer. */
  amount: z.string().regex(/^\d+$/).optional(),
})

const payAndFetchSchema = z.object({
  serviceId: z.string().min(1).optional(),
  paymentPayload: z.record(z.string(), z.unknown()),
  paymentRequirements: z.record(z.string(), z.unknown()),
  resourceUrl: z.url().optional(),
})

const paymentStatusSchema = z.object({
  quoteId: z.string().min(1),
})

const getCreditSchema = z.object({
  account: z.string().min(1),
})

export type SearchServicesArgs = z.infer<typeof searchServicesSchema>
export type GetServiceArgs = z.infer<typeof getServiceSchema>
export type PreparePaymentArgs = z.infer<typeof preparePaymentSchema>
export type PayAndFetchArgs = z.infer<typeof payAndFetchSchema>
export type PaymentStatusArgs = z.infer<typeof paymentStatusSchema>
export type GetCreditArgs = z.infer<typeof getCreditSchema>

const SCHEMAS = {
  search_services: searchServicesSchema,
  get_service: getServiceSchema,
  prepare_payment: preparePaymentSchema,
  pay_and_fetch: payAndFetchSchema,
  payment_status: paymentStatusSchema,
  get_credit: getCreditSchema,
} as const

const DESCRIPTIONS: Record<McpToolName, string> = {
  search_services: 'Find x402 services in this facilitator catalog',
  get_service: 'Return one service, including its schema',
  prepare_payment:
    'Mint a quote and return payment requirements. Does not spend and does not accept a buyer key.',
  pay_and_fetch:
    'Verify a caller-signed payment, settle it, and fetch the resource. The caller signs; this server does not.',
  payment_status: 'Return deposit, swap, refund, or failure state for a quote',
  get_credit:
    'Return spendable and pending credit. This facilitator holds no buyer balance, so both are zero.',
}

const INPUT_SCHEMAS: Record<McpToolName, McpTool['inputSchema']> = {
  search_services: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Match against name and description' },
      network: { type: 'string' },
      asset: { type: 'string' },
      category: { type: 'string' },
      maxPrice: { type: 'string', description: 'Decimal price ceiling' },
      owner: { type: 'string' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
    additionalProperties: false,
  },
  get_service: {
    type: 'object',
    properties: { serviceId: { type: 'string' } },
    required: ['serviceId'],
    additionalProperties: false,
  },
  prepare_payment: {
    type: 'object',
    properties: {
      serviceId: { type: 'string' },
      buyerNetwork: { type: 'string', description: 'CAIP-2 origin network' },
      buyerAsset: { type: 'string' },
      buyerAddress: { type: 'string', description: 'Public refund address. Not a key.' },
      buyerAssetId: { type: 'string' },
      sellerNetwork: { type: 'string' },
      amount: { type: 'string', description: 'Atomic destination amount' },
    },
    required: ['serviceId', 'buyerNetwork', 'buyerAsset', 'buyerAddress'],
    additionalProperties: false,
  },
  pay_and_fetch: {
    type: 'object',
    properties: {
      serviceId: { type: 'string' },
      paymentPayload: { type: 'object', description: 'Signed x402 payment payload' },
      paymentRequirements: {
        type: 'object',
        description: 'Requirements returned by prepare_payment',
      },
      resourceUrl: { type: 'string', description: 'Overrides the listing resource URL' },
    },
    required: ['paymentPayload', 'paymentRequirements'],
    additionalProperties: false,
  },
  payment_status: {
    type: 'object',
    properties: { quoteId: { type: 'string' } },
    required: ['quoteId'],
    additionalProperties: false,
  },
  get_credit: {
    type: 'object',
    properties: { account: { type: 'string', description: 'Public account id' } },
    required: ['account'],
    additionalProperties: false,
  },
}

const FORBIDDEN_KEYS = new Set(['privatekey', 'private_key', 'mnemonic', 'seed', 'secretkey'])

export function isMcpToolName(name: string): name is McpToolName {
  return (MCP_TOOL_NAMES as readonly string[]).includes(name)
}

export function listTools(): McpTool[] {
  return MCP_TOOL_NAMES.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: INPUT_SCHEMAS[name],
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function containsForbiddenKey(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((item) => containsForbiddenKey(item, depth + 1))
  return Object.entries(value).some(([key, child]) => {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return true
    return containsForbiddenKey(child, depth + 1)
  })
}

function toolResult(isError: boolean, data: unknown): McpToolResult {
  return { isError, content: [{ type: 'text', text: JSON.stringify(data) }] }
}

export async function callTool(
  name: McpToolName,
  args: Record<string, unknown>,
  handlers?: McpToolHandlers,
): Promise<McpToolResult> {
  if (containsForbiddenKey(args)) {
    return toolResult(true, {
      error: 'rejected_secret',
      message: 'Buyer keys are not accepted. Sign the payment locally and pass the payload.',
    })
  }
  if (!handlers) {
    return toolResult(true, {
      error: 'facilitator_unavailable',
      message: 'MCP tools are not bound to a facilitator',
    })
  }
  const parsed = SCHEMAS[name].safeParse(args)
  if (!parsed.success) {
    return toolResult(true, {
      error: 'invalid_arguments',
      message: parsed.error.issues[0]?.message ?? 'Invalid arguments',
    })
  }
  try {
    const outcome = await handlers[name](parsed.data as never)
    if (outcome.isError) {
      return toolResult(true, { error: outcome.error, message: outcome.message })
    }
    return toolResult(false, outcome.data)
  } catch (error) {
    return toolResult(true, {
      error: 'unexpected_error',
      message: error instanceof Error ? error.message : 'Tool failed',
    })
  }
}

export async function handleMcp(
  message: unknown,
  handlers?: McpToolHandlers,
): Promise<JsonRpcResponse> {
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
        serverInfo: { name: 'x402interop-facilitator-mcp', version: '1.0.0' },
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
    return { jsonrpc: '2.0', id, result: await callTool(name, args, handlers) }
  }
  if (message.method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }
}
