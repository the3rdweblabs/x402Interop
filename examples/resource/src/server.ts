// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { URL } from 'node:url'

import { X402_VERSION } from '@x402interop/core'
import { createInteropFacilitator } from '@x402interop/facilkit'
import { createOneClickClient } from '@x402interop/intents'
import { paymentRequiredFromRequirement } from '@x402interop/servers'

import { buildCatalog, catalogView, type ProtectedResource } from './catalog.js'
import type { ResourceConfig } from './config.js'

type Json = Record<string, unknown>

function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
  })
  res.end(data)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (chunks.length === 0) return undefined
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

function decodePaymentSignature(value: string | undefined): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'))
  } catch {
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  }
}

function quoteRequestFor(
  resource: ProtectedResource,
  buyer: { network: string; asset: string; assetId?: string; address: string },
) {
  return {
    sellerNetwork: resource.sellerNetwork,
    sellerAsset: resource.sellerAsset,
    sellerAssetId: resource.sellerAssetId,
    sellerAddress: resource.sellerAddress,
    amount: resource.amount,
    buyerNetwork: buyer.network,
    buyerAsset: buyer.asset,
    ...(buyer.assetId ? { buyerAssetId: buyer.assetId } : {}),
    buyerAddress: buyer.address,
    deliveryMode: resource.deliveryMode,
  }
}

export function createResourceApp(config: ResourceConfig) {
  const intentsClient = createOneClickClient(
    config.MODE === 'test'
      ? { type: 'simulator', seed: 'x402interop-resource-test' }
      : { type: 'live', apiKey: config.ONECLICK_API_KEY, baseUrl: config.ONE_CLICK_API_URL },
  )

  const facilitator = createInteropFacilitator({ intentsClient })
  const resources = buildCatalog(config)
  const byId = new Map(resources.map((r) => [r.id, r]))

  async function handleChallenge(
    req: IncomingMessage,
    res: ServerResponse,
    resource: ProtectedResource,
    baseUrl: string,
  ) {
    const url = new URL(req.url ?? '/', baseUrl)
    const buyer = {
      network: url.searchParams.get('buyerNetwork') ?? config.DEFAULT_BUYER_NETWORK,
      asset: url.searchParams.get('buyerAsset') ?? config.DEFAULT_BUYER_ASSET,
      assetId: url.searchParams.get('buyerAssetId') ?? config.DEFAULT_BUYER_ASSET_ID,
      address: url.searchParams.get('buyerAddress') ?? config.DEFAULT_BUYER_ADDRESS,
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(buyer.address) && !buyer.address.includes('.')) {
      // allow non-EVM placeholder formats in test; facilitator/quote parsing will validate as needed
    }
    const quoted = await facilitator.routeFacilitator(
      'POST',
      '/interop/quote',
      quoteRequestFor(resource, buyer),
    )
    if (quoted.status >= 400) return json(res, quoted.status, quoted.body)
    const requirement = quoted.body as Json
    const paymentRequired = paymentRequiredFromRequirement(requirement as any, {
      resource: {
        url: `${baseUrl}${resource.path}`,
        description: resource.description,
        mimeType: 'application/json',
      },
      error: 'PAYMENT-SIGNATURE header is required',
    })
    const payload = {
      ...paymentRequired,
      // convenience top-level fields for simple agents
      x402interop: {
        mode: config.MODE,
        quoteId: requirement.quoteId,
        depositAddress: requirement.depositAddress,
        buyerNetwork: buyer.network,
        buyerAssetId: buyer.assetId,
      },
    }
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
    const mode = config.PAYMENT_REQUIRED_BODY
    const accept = header(req, 'accept') ?? ''
    if (mode === 'json' || (mode === 'auto' && accept.includes('text/html'))) {
      return json(res, 402, payload)
    }
    if (mode === 'empty') {
      res.writeHead(402, { 'PAYMENT-REQUIRED': encoded, 'content-length': 0 })
      res.end()
      return
    }
    const body = JSON.stringify({ error: 'Payment required' })
    res.writeHead(402, {
      'PAYMENT-REQUIRED': encoded,
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
    return
  }

  async function handlePaidAccess(
    req: IncomingMessage,
    res: ServerResponse,
    resource: ProtectedResource,
    baseUrl: string,
  ) {
    const sig = decodePaymentSignature(
      header(req, 'payment-signature') ?? header(req, 'PAYMENT-SIGNATURE'),
    ) as Json | undefined
    let body: Json | undefined
    if (!sig && (req.method === 'POST' || req.method === 'PUT')) {
      body = (await readBody(req)) as Json | undefined
    }
    const settlementReq = (sig ?? body) as Json | undefined
    if (!settlementReq?.paymentPayload || !settlementReq?.paymentRequirements) {
      return handleChallenge(req, res, resource, baseUrl)
    }
    const settled = await facilitator.routeFacilitator('POST', '/settle', {
      x402Version: X402_VERSION,
      paymentPayload: settlementReq.paymentPayload,
      paymentRequirements: settlementReq.paymentRequirements,
    })
    const outcome = settled.body as Json
    if (!outcome?.success) {
      return json(res, 402, {
        error: 'payment_not_settled',
        message:
          (outcome?.errorMessage as string) ||
          (outcome?.invalidMessage as string) ||
          'Payment was not accepted or settlement has not completed',
        settlement: outcome,
        hint:
          config.MODE === 'test'
            ? 'In MODE=test, the agent should build a signed payload and let the simulated facilitator record the deposit (or use /interop/simulate/deposit when applicable).'
            : 'Ensure the origin transfer reached the deposit address and retry after settlement progresses.',
      })
    }
    return json(res, 200, {
      ok: true,
      resource: resource.id,
      content: resource.content,
      settlement: outcome,
      servedAt: new Date().toISOString(),
    })
  }

  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET'
      const baseUrl = `http://${req.headers.host ?? `127.0.0.1:${config.PORT}`}`
      const url = new URL(req.url ?? '/', baseUrl)
      const path = url.pathname

      if (method === 'GET' && path === '/health') {
        return json(res, 200, { status: 'ok', mode: config.MODE, service: 'resource' })
      }
      if (method === 'GET' && path === '/catalog') {
        return json(res, 200, catalogView(resources, baseUrl))
      }

      const resourceMatch = path.match(/^\/r\/([a-z0-9-]+)$/)
      if (resourceMatch) {
        const resource = byId.get(resourceMatch[1]!)
        if (!resource) return json(res, 404, { error: 'not_found', message: 'Unknown resource' })
        if (method === 'GET' || method === 'POST') {
          const hasSig = !!(header(req, 'payment-signature') ?? header(req, 'PAYMENT-SIGNATURE'))
          if (hasSig || method === 'POST') return handlePaidAccess(req, res, resource, baseUrl)
          return handleChallenge(req, res, resource, baseUrl)
        }
        return json(res, 405, { error: 'method_not_allowed' })
      }

      // Pass facilitator routes through (interop/quote, verify, settle, supported, simulate, status, mcp)
      if (
        path.startsWith('/interop/') ||
        path === '/verify' ||
        path === '/settle' ||
        path === '/supported' ||
        path === '/mcp' ||
        path.startsWith('/discovery/')
      ) {
        const body = method === 'GET' ? undefined : await readBody(req)
        const headers: Record<string, string | undefined> = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers[k.toLowerCase()] = v
          else if (Array.isArray(v) && v[0]) headers[k.toLowerCase()] = v[0]
        }
        const result = await facilitator.routeFacilitator(method, req.url ?? path, body, headers)
        return json(res, result.status, result.body)
      }

      return json(res, 404, { error: 'not_found' })
    } catch (err) {
      return json(res, 500, {
        error: 'internal_error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return { server, facilitator, resources, intentsClient }
}
