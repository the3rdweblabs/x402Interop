// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * MCP buyer. It calls a facilitator's tools over JSON-RPC and never holds a
 * signing key. Sign with `buildEvmPaymentPayload`, then pass the payload to
 * `payAndFetch`.
 */

import type {
  GetCreditInput,
  GetServiceInput,
  PaymentStatusInput,
  PreparePaymentInput,
  SearchServicesInput,
  X402InteropClient,
} from './buyer.js'

export interface McpBuyerClientOptions {
  /** Facilitator MCP endpoint, for example `http://127.0.0.1:4020/mcp`. */
  url: string
  fetchImpl?: typeof fetch
}

export interface McpToolCallResult {
  isError: boolean
  data: unknown
}

export interface McpBuyerClient extends X402InteropClient {
  searchServices(input: SearchServicesInput): Promise<unknown>
  getService(input: GetServiceInput): Promise<unknown>
  payAndFetch(input: Record<string, unknown>): Promise<unknown>
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>
}

interface JsonRpcEnvelope {
  result?: { isError?: boolean; content?: { text?: string }[] }
  error?: { message?: string }
}

function parseToolResult(body: JsonRpcEnvelope): McpToolCallResult {
  if (body.error) {
    throw new Error(body.error.message ?? 'MCP request failed')
  }
  const text = body.result?.content?.[0]?.text
  let data: unknown = text
  if (typeof text === 'string') {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { isError: body.result?.isError === true, data }
}

export function createMcpBuyerClient(options: McpBuyerClientOptions): McpBuyerClient {
  const fetchImpl = options.fetchImpl ?? fetch

  async function callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const response = await fetchImpl(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    })
    if (!response.ok) {
      throw new Error(`MCP HTTP ${response.status}`)
    }
    return parseToolResult((await response.json()) as JsonRpcEnvelope)
  }

  async function callOk(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await callTool(name, args)
    if (result.isError) {
      const data = result.data as { message?: string; error?: string }
      throw new Error(data.message ?? data.error ?? `${name} failed`)
    }
    return result.data
  }

  return {
    callTool,
    searchServices(input) {
      return callOk('search_services', {
        ...(input.query ? { query: input.query } : {}),
        ...(input.network ? { network: input.network } : {}),
        ...(input.maxPrice ? { maxPrice: input.maxPrice } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      })
    },
    getService(input) {
      return callOk('get_service', { serviceId: input.serviceId })
    },
    async preparePayment(input: PreparePaymentInput) {
      const data = (await callOk('prepare_payment', {
        serviceId: input.serviceId,
        buyerNetwork: input.buyerNetwork,
        buyerAsset: input.buyerAsset,
        buyerAddress: input.buyerAddress,
      })) as Awaited<ReturnType<X402InteropClient['preparePayment']>>
      return data
    },
    async payAndFetch(input) {
      const result = await callTool('pay_and_fetch', input)
      if (result.isError) {
        const data = result.data as { message?: string }
        throw new Error(data.message ?? 'pay_and_fetch failed')
      }
      return result.data
    },
    async paymentStatus(input: PaymentStatusInput) {
      return callOk('payment_status', { quoteId: input.quoteId }) as ReturnType<
        X402InteropClient['paymentStatus']
      >
    },
    async getCredit(input: GetCreditInput) {
      return callOk('get_credit', { account: input.account }) as ReturnType<
        X402InteropClient['getCredit']
      >
    },
  }
}
