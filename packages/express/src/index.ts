// SPDX-License-Identifier: GPL-3.0-or-later
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

/**
 * Express-style middleware. With no payment header it answers 402. With one,
 * it calls `next` and does not verify. Verification belongs to the facilitator.
 */
export function x402interop(options: SellerOptions) {
  return function interopMiddleware(
    req: HttpRequestLike,
    res: HttpResponseLike,
    next: () => void,
  ): void {
    const payment =
      headerValue(req.headers, 'payment-signature') ?? headerValue(req.headers, 'x-payment')
    if (!payment) {
      const required = buildPaymentRequired(options)
      res.statusCode = 402
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('payment-required', Buffer.from(JSON.stringify(required)).toString('base64'))
      res.end(JSON.stringify(required))
      return
    }
    next()
  }
}
