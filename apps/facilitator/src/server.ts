// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import type { SettleRequest, VerifyRequest } from '@x402interop/core'
import {
  facilitatorRequestSchema,
  settlePayment,
  supportedResponse,
  verifyPayment,
} from '@x402interop/facilkit'
import { parseQuoteRequest, prepareQuote } from '@x402interop/quote'
import { SCHEME_IDS } from '@x402interop/core'
import { summaryForScheme } from '@x402interop/schemes'
import { MemoryStatusTracker } from '@x402interop/status'
import { createOneClickClient, type OneClickClient } from '@x402interop/intents'

import { supportedKinds, getSupportedKinds } from './supported.js'
import { store } from './store.js'

export interface HttpResult {
  status: number
  body: unknown
}

const statusTracker = new MemoryStatusTracker()
const intentsClient: OneClickClient = createOneClickClient()

// Track quoteId -> depositAddress mapping
const quoteToDeposit = new Map<string, string>()
const usedNonces = new Set<string>()

export function methodOf(method: string | undefined): string {
  return method ?? 'GET'
}

export function requestPath(url: string | undefined): string {
  const raw = url && url.length > 0 ? url : '/'
  const query = raw.indexOf('?')
  const path = query === -1 ? raw : raw.slice(0, query)
  return path.length > 0 ? path : '/'
}

function jsonError(error: string, message: string, status: number): HttpResult {
  return { status, body: { error, message } }
}

function quoteIdFromDeposit(depositAddress: string): string {
  return `q_${Buffer.from(depositAddress).toString('hex').slice(0, 16)}`
}

export async function routeFacilitator(
  method: string,
  path: string,
  body: unknown,
): Promise<HttpResult> {
  if (method === 'GET' && path === '/health') {
    return { status: 200, body: { status: 'ok', service: 'facilitator' } }
  }
  if (method === 'GET' && (path === '/mcp' || path === '/mcp/tools' || path === '/.well-known/mcp')) {
    return { status: 200, body: { jsonrpc: '2.0', result: { tools: listTools() }, serverInfo: { name: 'x402interop-facilitator-mcp', version: '0.0.0' } } }
  }
  if (method === 'POST' && (path === '/mcp' || path === '/mcp/rpc')) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    return handleMcpRequest(bodyStr)
  }
  if (method === 'GET' && path === '/supported') {
    return { status: 200, body: supportedResponse(getSupportedKinds ? getSupportedKinds() : supportedKinds()) }
  }
  if (method === 'POST' && path === '/interop/quote') {
    const parsed = parseQuoteRequest(body)
    const buyerFamily = ((): keyof typeof SCHEME_IDS | undefined => {
      const families = Object.keys(SCHEME_IDS) as (keyof typeof SCHEME_IDS)[]
      for (const family of families) {
        if (
          family === 'evm' &&
          (parsed.buyerNetwork.startsWith('eip155:') ||
            parsed.buyerNetwork === 'base' ||
            parsed.buyerNetwork.includes('ethereum'))
        )
          return 'evm'
        if (
          family === 'svm' &&
          (parsed.buyerNetwork.startsWith('solana:') || parsed.buyerNetwork === 'solana')
        )
          return 'svm'
        if (family === 'sui' && parsed.buyerNetwork.startsWith('sui:')) return 'sui'
        if (family === 'near' && parsed.buyerNetwork.startsWith('near:')) return 'near'
        if (family === 'ton' && parsed.buyerNetwork.startsWith('ton:')) return 'ton'
        if (family === 'tron' && parsed.buyerNetwork.startsWith('tron:')) return 'tron'
        if (family === 'xrpl' && parsed.buyerNetwork.startsWith('xrpl:')) return 'xrpl'
        if (family === 'lightning' && parsed.buyerNetwork.startsWith('lightning:'))
          return 'lightning'
      }
      return undefined
    })()
    const scheme = buyerFamily ? SCHEME_IDS[buyerFamily] : SCHEME_IDS.evm

    try {
      const deadline = new Date(Date.now() + 300000).toISOString()
      const oneClickQuote = await intentsClient.quote({
        originAsset: parsed.buyerAsset,
        destinationAsset: parsed.sellerAsset,
        amount: parsed.amount,
        recipient: parsed.sellerAddress,
        refundTo: parsed.buyerAddress,
        deadline,
        swapType: 'EXACT_OUTPUT',
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
      })
      const quote = {
        quoteId: oneClickQuote.quoteId,
        depositAddress: oneClickQuote.depositAddress,
        originNetwork: parsed.buyerNetwork,
        originAsset: parsed.buyerAsset,
        originAmount: oneClickQuote.originAmount,
        expiresAt: oneClickQuote.expiresAt,
        timeEstimateSeconds: oneClickQuote.timeEstimateSeconds,
        deliveryMode: parsed.deliveryMode,
        refundTo: parsed.buyerAddress,
      }
      quoteToDeposit.set(quote.quoteId, quote.depositAddress)
      try {
        store.saveQuote(quote.quoteId, quote)
        store.saveDepositMapping(quote.quoteId, quote.depositAddress)
      } catch {}
      const prepared = prepareQuote(parsed, quote, scheme)
      statusTracker.record({ quoteId: quote.quoteId, state: 'pending_deposit' })
      return {
        status: 200,
        body: {
          ...prepared.requirements,
          quoteId: quote.quoteId,
          depositAddress: quote.depositAddress,
          extensions: prepared.extensions,
          schemeSummary: summaryForScheme(scheme),
        },
      }
    } catch {
      // Fallback to scaffold behavior for safety
      const depositAddress = `0xinterop${Buffer.from(`${parsed.sellerNetwork}:${parsed.amount}:${Date.now()}`).toString('hex').slice(0, 40)}`
      const quote = {
        quoteId: quoteIdFromDeposit(depositAddress),
        depositAddress,
        originNetwork: parsed.buyerNetwork,
        originAsset: parsed.buyerAsset,
        originAmount: parsed.amount,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        timeEstimateSeconds: 45,
        deliveryMode: parsed.deliveryMode,
        refundTo: parsed.buyerAddress,
      }
      quoteToDeposit.set(quote.quoteId, quote.depositAddress)
      try {
        store.saveQuote(quote.quoteId, quote)
        store.saveDepositMapping(quote.quoteId, quote.depositAddress)
      } catch {}
      const prepared = prepareQuote(parsed, quote, scheme)
      statusTracker.record({ quoteId: quote.quoteId, state: 'pending_deposit' })
      return {
        status: 200,
        body: {
          ...prepared.requirements,
          quoteId: quote.quoteId,
          depositAddress: quote.depositAddress,
          extensions: prepared.extensions,
          schemeSummary: summaryForScheme(scheme),
        },
      }
    }
  }
  if (method === 'GET' && path.startsWith('/interop/status/')) {
    const quoteId = path.slice('/interop/status/'.length)
    const tracked = statusTracker.get(quoteId)
    if (!tracked) {
      return jsonError('not_found', 'Quote not found', 404)
    }
    // Try to sync from intents client if we have mapping
    const depositAddress = quoteToDeposit.get(quoteId)
    if (depositAddress) {
      try {
        const status = await intentsClient.status(depositAddress)
        // Map 1Click status to our state
        const stateMap: Record<string, string> = {
          PENDING_DEPOSIT: 'pending_deposit',
          KNOWN_DEPOSIT_TX: 'deposit_seen',
          PROCESSING: 'swapping',
          SUCCESS: 'success',
          INCOMPLETE_DEPOSIT: 'refunded',
          REFUNDED: 'refunded',
          FAILED: 'failed',
        }
        const mapped = stateMap[status.status] ?? tracked.state
        if (mapped !== tracked.state) {
          statusTracker.record({ quoteId, state: mapped as any })
          const updated = statusTracker.get(quoteId)
          if (updated) {
            return { status: 200, body: updated }
          }
        }
      } catch {
        // Ignore errors, return tracked status
      }
    }
    return { status: 200, body: tracked }
  }
  if (path === '/verify' || path === '/settle') {
    if (method !== 'POST') {
      return jsonError('method_not_allowed', 'Use POST', 405)
    }
    const parsed = facilitatorRequestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('invalid_request', 'Body does not match the facilitator request', 400)
    }
    // Check for nonce reuse
    const payload = (parsed.data as any).paymentPayload
    const binding = payload?.payload?.binding ?? payload?.binding
    if (binding?.nonce && usedNonces.has(binding.nonce)) {
      return {
        status: 200,
        body: { isValid: false, invalidReason: 'nonce_reused', invalidMessage: 'Nonce has been used' },
      }
    }
    const outcome =
      path === '/verify'
        ? await verifyPayment(parsed.data as VerifyRequest)
        : await settlePayment(parsed.data as SettleRequest)
    // If settling successfully (not the case in scaffold, but mark nonce as used)
    if (path === '/settle' && binding?.nonce) {
      usedNonces.add(binding.nonce)
      try {
        store.addNonce(binding.nonce)
      } catch {}
    }
    return { status: 200, body: outcome }
  }
  return jsonError('not_found', 'No such route', 404)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(payload)
}

export async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req)
  if (raw !== '') {
    try {
      const body: unknown = JSON.parse(raw)
      const result = await routeFacilitator(methodOf(req.method), requestPath(req.url), body)
      sendJson(res, result.status, result.body)
      return
    } catch {
      sendJson(res, 400, { error: 'invalid_json', message: 'Request body is not valid JSON' })
      return
    }
  }
  const result = await routeFacilitator(methodOf(req.method), requestPath(req.url), undefined)
  sendJson(res, result.status, result.body)
}

export function createFacilitatorServer(): Server {
  return createServer((req, res) => {
    void dispatch(req, res)
  })
}


// MCP routes
import { handleMcp, listTools } from './mcp.js'

export async function handleMcpRequest(body: string): Promise<HttpResult> {
  try {
    const message = JSON.parse(body)
    const response = handleMcp(message)
    return { status: 200, body: response }
  } catch {
    return { status: 400, body: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } } }
  }
}
