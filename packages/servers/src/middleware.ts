// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * This module now lives in `@x402interop/servers`: it is the
 * framework-agnostic (duck-typed req/res) seller middleware shared by the
 * `./express`, `./hono`, `./fastify`, and `./next` bindings, and the root
 * entry re-exports it. `@x402interop/servers/express` is the canonical
 * import path (the former `@x402interop/express` package is deleted).
 *
 * The name `paymentMiddleware` deliberately lives here no longer: in the
 * framework subpaths that name is the dispatcher that selects between our
 * middleware and upstream `@x402/<framework>`.
 */

import {
  X402_VERSION,
  type DeliveryMode,
  type Network,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type ResourceInfo,
} from '@x402interop/core'
import {
  FacilitatorUnavailable,
  settleWithFacilitator,
  verifyWithFacilitator,
} from './facilitator-client.js'

/** Options a seller passes to the middleware. `amount` is atomic; `price` is the human label. */
export interface SellerOptions {
  facilitator: string
  payTo: string
  network: Network
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
  buyerNetwork?: Network
  /** Buyer asset hint used when minting quotes. */
  buyerAsset?: string
  /** Buyer address hint used when minting quotes. */
  buyerAddress?: string
  /**
   * `auto` is the default: browsers (`Accept: text/html`) get the full JSON
   * requirements, API clients get the minimal x402.org-style body. `json`
   * forces full JSON for every client, `error` forces minimal, `empty` omits
   * the body. The full requirements are always in the `PAYMENT-REQUIRED` header.
   */
  paymentRequiredBody?: 'auto' | 'empty' | 'json' | 'error'
}

export interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>
}

export interface HttpResponseLike {
  statusCode: number
  headersSent?: boolean
  setHeader(name: string, value: string | number): void
  end(body?: string): void
}

function headerValue(headers: HttpRequestLike['headers'], name: string): string | undefined {
  const value = headers[name]
  if (Array.isArray(value)) return value[0]
  return value
}

function paymentRequiredBodyMode(
  options: SellerOptions,
  accept: string,
): 'empty' | 'json' | 'error' {
  const configured = options.paymentRequiredBody ?? process.env.PAYMENT_REQUIRED_BODY
  if (configured === 'empty' || configured === 'error' || configured === 'json') {
    return configured
  }
  return accept.toLowerCase().includes('text/html') ? 'json' : 'error'
}

function sendPaymentRequired(
  res: HttpResponseLike,
  required: PaymentRequired,
  options: SellerOptions,
  accept = '',
): void {
  const encoded = Buffer.from(JSON.stringify(required)).toString('base64')
  res.statusCode = 402
  res.setHeader('PAYMENT-REQUIRED', encoded)
  res.setHeader('payment-required', encoded)
  const mode = paymentRequiredBodyMode(options, accept)
  if (mode === 'json') {
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(required))
    return
  }
  if (mode === 'empty') {
    res.end()
    return
  }
  const body = JSON.stringify({ error: 'Payment required' })
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

const DEFAULT_RESOURCE: ResourceInfo = {
  url: 'https://example.invalid/resource',
  description: 'x402interop protected resource',
  mimeType: 'application/json',
}

/**
 * Decodes the `PAYMENT-SIGNATURE` header. The wire format is base64-encoded
 * JSON containing the `PaymentPayload`. A header that does not decode is a
 * client error, not a payment: it is reported as `402` with a reason so the
 * buyer can fix its request.
 */
export function decodePaymentHeader(value: string): PaymentPayload | undefined {
  try {
    const json = Buffer.from(value, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as unknown
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const candidate = parsed as Partial<PaymentPayload>
    if (!candidate.accepted || !candidate.payload) return undefined
    return candidate as PaymentPayload
  } catch {
    return undefined
  }
}

/**
 * Picks the requirement the buyer actually paid against. A 402 advertises one
 * `accepts` entry per buyer scheme; the payload echoes the chosen one in
 * `accepted`, so the seller must verify against *that*, not against its own
 * first entry. Verifying against the wrong requirement is how a cheap scheme
 * gets used to pay for an expensive one.
 */
export function requirementFor(
  payload: PaymentPayload,
  options: SellerOptions,
): PaymentRequirements | undefined {
  const offered = buildPaymentRequired(options).accepts
  const accepted = payload.accepted
  if (!accepted) return undefined
  const match = offered.find(
    (entry) =>
      entry.scheme === accepted.scheme &&
      entry.network === accepted.network &&
      entry.asset === accepted.asset &&
      entry.amount === accepted.amount,
  )
  if (match) return match
  // A buyer may pay against terms the seller advertised out of band (for
  // example a quote minted by the facilitator). Accept it only when the
  // scheme is one this seller offers for this resource.
  const sameScheme = offered.some(
    (entry) => entry.scheme === accepted.scheme && entry.network === accepted.network,
  )
  return sameScheme ? accepted : undefined
}

/** Base64-encoded JSON `SettleResponse`, carried in `PAYMENT-RESPONSE`. */
function encodePaymentResponse(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64')
}

function sendProblem(res: HttpResponseLike, status: number, body: Record<string, unknown>): void {
  if (res.headersSent) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * Decides whether a settlement outcome satisfies the seller's delivery mode.
 *
 * - `on_success`: the swap must have completed.
 * - `on_deposit`: the origin deposit is enough; the swap may still be running.
 * - `pending_push`: answer `202` and let the seller deliver out of band once
 *   the swap finishes, rather than holding the request open.
 *
 * The facilitator reports the phase in `extra.swapStatus`; a settlement with
 * no phase information is treated as complete, because a facilitator that
 * omits it is asserting plain success.
 */
function deliveryVerdict(
  mode: DeliveryMode,
  settled: { success: boolean; transaction?: string; extra?: Record<string, unknown> },
): { serve: boolean; accepted: 'deposit' | 'success' | 'pending'; status: number } {
  const phase = settled.extra?.swapStatus
  const completed = phase === undefined || phase === 'SUCCESS'
  if (mode === 'pending_push' && !completed) {
    return { serve: false, accepted: 'pending', status: 202 }
  }
  if (mode === 'on_success' && !completed) {
    return { serve: false, accepted: 'pending', status: 402 }
  }
  return {
    serve: true,
    accepted: completed ? 'success' : 'deposit',
    status: 200,
  }
}

/**
 * Wrap one minted interop requirement in the canonical x402 v2
 * `PaymentRequired` envelope. The facilitator's quote route returns the
 * requirement flat; a buyer client must still see `accepts`.
 */
export function paymentRequiredFromRequirement(
  requirement: PaymentRequirements,
  options: {
    resource?: ResourceInfo
    extensions?: Record<string, unknown>
    error?: string
  } = {},
): PaymentRequired {
  return {
    x402Version: X402_VERSION,
    error: options.error ?? 'PAYMENT-SIGNATURE header is required',
    resource: options.resource ?? DEFAULT_RESOURCE,
    accepts: [requirement],
    ...(options.extensions ? { extensions: options.extensions } : {}),
  }
}

/**
 * Build the 402 body for the offline compatibility path. A production
 * interop response must be enriched with a real single-use quote first.
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
    resource: options.resource ?? DEFAULT_RESOURCE,
    accepts,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accept either a canonical 402 body or the facilitator's flat quote body. */
function toPaymentRequired(value: unknown, options: SellerOptions): PaymentRequired {
  if (!isRecord(value)) return buildPaymentRequired(options)
  if (Array.isArray(value.accepts)) return value as unknown as PaymentRequired
  const {
    quoteId: _quoteId,
    depositAddress: _depositAddress,
    schemeSummary: _summary,
    extensions,
    ...requirement
  } = value
  return paymentRequiredFromRequirement(requirement as unknown as PaymentRequirements, {
    resource: options.resource,
    ...(isRecord(extensions) ? { extensions } : {}),
  })
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  if (typeof fetch === 'function') {
    return fetch(url, init) as Promise<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>
  }
  /* v8 ignore start -- network fallback for runtimes without global fetch */
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
  /* v8 ignore stop */
}

/**
 * HTTP middleware (duck-typed req/res, no framework dependency).
 *
 * No payment header: answer `402`. A payment header: ask the facilitator to
 * verify it, then to settle it, and only serve the resource when the outcome
 * satisfies the configured delivery mode. Verification and settlement are
 * never skipped - a request that carries a payment header but cannot be
 * checked fails closed.
 */
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
      headerValue(req.headers, 'Payment-Signature')
    if (!payment) {
      const shouldMint = options.mintQuotes === true && Boolean(options.facilitator)
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
            ...(options.apiKey ? { authorization: 'Bearer ' + options.apiKey } : {}),
          },
          body,
        })
          .then(async (resp) => {
            if (res.statusCode && res.statusCode !== 200 && res.headersSent) return
            const json = toPaymentRequired(await resp.json(), options)
            sendPaymentRequired(res, json, options, headerValue(req.headers, 'accept') ?? '')
          })
          .catch(() => {
            if (res.statusCode !== 200 && res.headersSent) return
            const failure = {
              error: 'quote_unavailable',
              message: 'A cross-chain payment quote could not be created.',
            }
            res.statusCode = 503
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(failure))
          })
        return
      }
      const required = buildPaymentRequired(options)
      sendPaymentRequired(res, required, options, headerValue(req.headers, 'accept') ?? '')
      return
    }

    void confirmPayment(res, next, payment, options)
  }
}

/**
 * The verified path. Asynchronous because it talks to the facilitator, but
 * the middleware signature stays synchronous: the caller's handler runs from
 * the promise, exactly as it did from `next()` before.
 */
async function confirmPayment(
  res: HttpResponseLike,
  next: () => void,
  payment: string,
  options: SellerOptions,
): Promise<void> {
  const payload = decodePaymentHeader(payment)
  if (!payload) {
    sendProblem(res, 402, {
      error: 'invalid_payment_header',
      message: 'The PAYMENT-SIGNATURE header is not base64-encoded payment JSON.',
    })
    return
  }
  const requirements = requirementFor(payload, options)
  if (!requirements) {
    // A payload paying against terms this seller never offered. Serving it
    // would let a buyer pick the cheapest scheme and pay for something else.
    sendProblem(res, 402, {
      error: 'unsupported_payment',
      message: 'The payment does not match any scheme this resource offers.',
    })
    return
  }

  const args = {
    facilitator: options.facilitator,
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
  }
  const proof = { paymentPayload: payload, paymentRequirements: requirements }

  let verified: Awaited<ReturnType<typeof verifyWithFacilitator>>
  try {
    verified = await verifyWithFacilitator(args, proof)
  } catch (err) {
    problemFromFacilitator(res, err, 'verify')
    return
  }
  if (!verified.isValid) {
    // A pending cross-chain swap is not a rejected payment: say so in a way
    // the buyer can retry on, and never let the handler run.
    const pending =
      verified.invalidReason === 'payment_pending' || verified.invalidReason === 'payment_not_found'
    sendProblem(res, 402, {
      error: verified.invalidReason ?? 'payment_invalid',
      message:
        verified.invalidMessage ??
        (pending
          ? 'The cross-chain deposit has not been observed yet. Retry shortly.'
          : 'The payment could not be verified.'),
      ...(pending ? { retryable: true } : {}),
      ...(verified.extra ? { extra: verified.extra } : {}),
    })
    return
  }

  let settled: Awaited<ReturnType<typeof settleWithFacilitator>>
  try {
    settled = await settleWithFacilitator(args, proof)
  } catch (err) {
    problemFromFacilitator(res, err, 'settle')
    return
  }
  if (!settled.success) {
    const pending =
      settled.errorReason === 'payment_pending' || settled.errorReason === 'payment_not_found'
    sendProblem(res, 402, {
      error: settled.errorReason ?? 'settlement_failed',
      message: settled.errorMessage ?? 'The payment could not be settled.',
      ...(pending ? { retryable: true } : {}),
    })
    return
  }

  const verdict = deliveryVerdict(
    options.deliveryMode,
    settled as {
      success: boolean
      transaction?: string
      extra?: Record<string, unknown>
    },
  )
  if (!verdict.serve) {
    if (verdict.status === 202) {
      // `pending_push`: accepted, but delivery happens out of band. The buyer
      // gets a receipt it can poll instead of an open connection.
      res.statusCode = 202
      res.setHeader('PAYMENT-RESPONSE', encodePaymentResponse(settled))
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          accepted: 'pending',
          transaction: settled.transaction,
          message: 'The deposit was accepted and the swap is still running.',
        }),
      )
      return
    }
    sendProblem(res, 402, {
      error: 'delivery_pending',
      message: `Delivery is set to ${options.deliveryMode} and the swap has not completed.`,
      retryable: true,
    })
    return
  }

  res.setHeader('PAYMENT-RESPONSE', encodePaymentResponse(settled))
  if (verdict.accepted === 'deposit') {
    // `on_deposit`: the origin funds are secured, the swap may still settle.
    res.setHeader('x-x402interop-accepted', 'deposit')
  }
  next()
}

/**
 * A facilitator we cannot reach is not a rejected payment. Answer `402` so the
 * buyer retries the same payment. The handler still does not run.
 */
function problemFromFacilitator(res: HttpResponseLike, err: unknown, stage: string): void {
  const unavailable = err instanceof FacilitatorUnavailable
  sendProblem(res, 402, {
    error: unavailable ? 'verification_unavailable' : 'verification_error',
    message: unavailable
      ? `The facilitator could not be reached to ${stage} this payment.`
      : `The facilitator ${stage} step failed.`,
    retryable: true,
  })
}

export default x402interop
