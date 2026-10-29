// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { PaymentRequired } from '@x402interop/core'

/**
 * Decode a 402 Payment Required response to preview price without paying.
 * Supports both header (PAYMENT-REQUIRED, base64) and body formats.
 */
export function decodePaymentRequired(response: Response): Promise<PaymentRequired> {
  // Try header first
  const header =
    response.headers.get('payment-required') ||
    response.headers.get('PAYMENT-REQUIRED') ||
    response.headers.get('x-payment-required')
  if (header) {
    try {
      const decoded = Buffer.from(header, 'base64').toString('utf-8')
      return Promise.resolve(JSON.parse(decoded))
    } catch {
      // fall through to body
    }
  }
  return response.json()
}

/**
 * Extract price information from PaymentRequired for preview.
 */
export function previewPaymentRequirements(paymentRequired: PaymentRequired): Array<{
  scheme: string
  network: string
  asset: string
  amount: string
  displayPrice?: string
  quoteId?: string
  depositAddress?: string
  expiresAt?: string
}> {
  return paymentRequired.accepts.map((accept: any) => ({
    scheme: accept.scheme,
    network: accept.network,
    asset: accept.asset,
    amount: accept.amount,
    displayPrice: accept.extra?.displayPrice,
    quoteId: accept.extra?.quoteId,
    depositAddress: accept.extra?.depositAddress,
    expiresAt: accept.extra?.expiresAt,
  }))
}

/**
 * Enforce hard price cap - fails if price exceeds cap.
 */
export function enforceHardPriceCap(
  paymentRequired: PaymentRequired,
  maxAmount: string,
  scheme?: string,
): PaymentRequired {
  const accepts = paymentRequired.accepts.filter((accept: any) => {
    if (scheme && accept.scheme !== scheme) return false
    // Simple string comparison for atomic amounts (assumes same decimals)
    try {
      if (BigInt(accept.amount) > BigInt(maxAmount)) {
        throw new Error(
          `Price exceeds hard cap: ${accept.amount} > ${maxAmount} for scheme ${accept.scheme}`,
        )
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('exceeds hard cap')) throw e
      // If parsing fails, be conservative
    }
    return true
  })
  if (accepts.length === 0 && scheme) {
    throw new Error(`No acceptable payment option under hard cap ${maxAmount}`)
  }
  return { ...paymentRequired, accepts: scheme ? accepts : paymentRequired.accepts }
}
