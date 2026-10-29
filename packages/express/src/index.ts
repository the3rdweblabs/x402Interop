// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  X402_VERSION,
  type DeliveryMode,
  type PaymentRequired,
  type PaymentRequirements,
  type ResourceInfo,
} from '@x402interop/core'

/** Options a seller passes to the middleware. `amount` is atomic; `price` is the human label. */
export interface SellerOptions {
  facilitator: string
  payTo: string
  network: string
  asset: string
  price: string
  amount: string
  deliveryMode: DeliveryMode
  apiKey?: string
  buyerSchemes?: string[]
  maxTimeoutSeconds?: number
  resource?: ResourceInfo
  /** When true, attempt to mint a quote via the facilitator's /interop/quote. */
  mintQuotes?: boolean
  /** Buyer network hint used when minting quotes (e.g. eip155:8453). */
  buyerNetwork?: string
  /** Buyer asset hint used when minting quotes. */
  buyerAsset?: string
  /** Buyer address hint used when minting quotes. */
  buyerAddress?: string
}

export interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>
}

export interface HttpResponseLike {
  statusCode: number
  setHeader(name: string, value: string | number): void
  end(body?: string): void
}

function headerValue(headers: HttpRequestLike['headers'], name: string): string | undefined {
  const value = headers[name]
  if (Array.isArray(value)) return value[0]
  return value
}

/**
 * Build the 402 body. Quote fields are absent until the facilitator mints one
 * per request. TODO: call `POST /interop/quote` before answering.
 */
export function buildPaymentRequired(options: SellerOptions): PaymentRequired {
  const schemes = options.buyerSchemes ?? ['x402interop-evm']
  const accepts: PaymentRequirements[] = schemes.map((scheme) => ({
    scheme,
    network: options.network,
    asset: options.asset,
    amount: options.amount,
    payTo: options.payTo,
    maxTimeoutSeconds: options.maxTimeoutSeconds ?? 300,
    extra: {
      displayPrice: options.price,
      deliveryMode: options.deliveryMode,
      facilitator: options.facilitator,
    },
  }))
  return {
    x402Version: X402_VERSION,
    error: 'PAYMENT-SIGNATURE header is required',
    resource: options.resource ?? {
      url: 'https://example.invalid/resource',
      description: 'x402interop protected resource',
      mimeType: 'application/json',
    },
    accepts,
  }
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  if (typeof fetch === 'function') {
    return fetch(url, init) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
  }
  // Fallback for older environments
  const https = await import('node:https')
  const http = await import('node:http')
  const { URL } = await import('node:url')
  const parsed = new URL(url)
  const mod = parsed.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.request(
      parsed,
      {
        method: init.method,
        headers: init.headers as Record<string, string>,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          resolve({
            ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode ?? 500,
            json: async () => JSON.parse(body.toString('utf8')),
          })
        })
      },
    )
    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

/**
 * Express-style middleware. With no payment header it answers 402. With one,
 * it calls `next` and does not verify. Verification belongs to the facilitator.
 * Uses the canonical x402 v2 HTTP transport headers where possible.
 */
export function x402Middleware(options: SellerOptions) {
  return x402interop(options)
}

export function x402(options: SellerOptions) {
  return x402interop(options)
}

export function paymentMiddleware(options: SellerOptions) {
  return x402interop(options)
}

export function x402interop(options: SellerOptions) {
  const buyerSchemes = options.buyerSchemes ?? ['x402interop-evm']
  return function interopMiddleware(
    req: HttpRequestLike,
    res: HttpResponseLike,
    next: () => void,
  ): void {
    const payment =
      headerValue(req.headers, 'payment-signature') ??
      headerValue(req.headers, 'PAYMENT-SIGNATURE') ??
      headerValue(req.headers, 'Payment-Signature') ??
      headerValue(req.headers, 'x-payment') ??
      headerValue(req.headers, 'X-PAYMENT') ??
      headerValue(req.headers, 'x402-payment') ??
      headerValue(req.headers, 'X402-PAYMENT')
    if (!payment) {
      const shouldMint = options.mintQuotes !== false && options.facilitator
      if (shouldMint) {
        const buyerNetwork =
          options.buyerNetwork ??
          (buyerSchemes[0]?.includes('evm')
            ? 'eip155:8453'
            : buyerSchemes[0]?.replace('x402interop-', '') === 'svm'
              ? 'solana:mainnet'
              : buyerSchemes[0]?.replace('x402interop-', '') === 'sui'
                ? 'sui:mainnet'
                : buyerSchemes[0]?.replace('x402interop-', '') === 'near'
                  ? 'near:mainnet'
                  : 'eip155:8453')
        const buyerAsset = options.buyerAsset ?? options.asset
        const buyerAddress = options.buyerAddress ?? options.payTo
        const body = JSON.stringify({
          sellerNetwork: options.network,
          sellerAsset: options.asset,
          sellerAddress: options.payTo,
          amount: options.amount,
          buyerNetwork,
          buyerAsset,
          buyerAddress,
          deliveryMode: options.deliveryMode,
        })
        void fetchJson(`${options.facilitator.replace(/\/$/, '')}/interop/quote`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
          },
          body,
        })
          .then(async (resp) => {
            if (res.statusCode && res.statusCode !== 200 && res.headersSent) return
            const json = (await resp.json()) as PaymentRequired & Record<string, unknown>
            res.statusCode = 402
            res.setHeader('content-type', 'application/json; charset=utf-8')
            const encoded = Buffer.from(JSON.stringify(json)).toString('base64')
            res.setHeader('PAYMENT-REQUIRED', encoded)
            res.setHeader('payment-required', encoded)
            res.end(JSON.stringify(json))
          })
          .catch(() => {
            if (res.statusCode === 402 && res.headersSent) return
            const required = buildPaymentRequired(options)
            res.statusCode = 402
            res.setHeader('content-type', 'application/json; charset=utf-8')
            const encoded = Buffer.from(JSON.stringify(required)).toString('base64')
            res.setHeader('PAYMENT-REQUIRED', encoded)
            res.setHeader('payment-required', encoded)
            res.end(JSON.stringify(required))
          })
        return
      }
      const required = buildPaymentRequired(options)
      res.statusCode = 402
      res.setHeader('content-type', 'application/json; charset=utf-8')
      const encoded = Buffer.from(JSON.stringify(required)).toString('base64')
      res.setHeader('PAYMENT-REQUIRED', encoded)
      res.setHeader('payment-required', encoded)
      res.setHeader('X-PAYMENT-REQUIRED', encoded)
      res.end(JSON.stringify(required))
      return
    }
    next()
  }
}

export default x402interop

