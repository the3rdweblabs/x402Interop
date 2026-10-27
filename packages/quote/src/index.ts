// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import {
  x402InteropExtension,
  type DeliveryMode,
  type PaymentRequirements,
  type X402InteropExtensions,
  type X402InteropQuoteInfo,
} from '@x402interop/core'
import { z } from 'zod'

/** Path the quote router would pick. The scaffold only classifies; it does not mint. */
export type PaymentPath = 'deposit_address' | 'intents_balance' | 'lightning_topup'

export interface QuoteRequest {
  sellerNetwork: string
  sellerAsset: string
  sellerAddress: string
  amount: string
  buyerNetwork: string
  buyerAsset: string
  buyerAddress: string
  deliveryMode: DeliveryMode
  depositType?: 'ORIGIN_CHAIN' | 'INTENTS'
}

export interface PreparedQuote {
  path: PaymentPath
  requirements: PaymentRequirements
  extensions: X402InteropExtensions
}

export const quoteRequestSchema = z.object({
  sellerNetwork: z.string().min(1),
  sellerAsset: z.string().min(1),
  sellerAddress: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  buyerNetwork: z.string().min(1),
  buyerAsset: z.string().min(1),
  buyerAddress: z.string().min(1),
  deliveryMode: z.enum(['on_deposit', 'on_success', 'pending_push']),
  depositType: z.enum(['ORIGIN_CHAIN', 'INTENTS']).optional(),
})

export function parseQuoteRequest(value: unknown): QuoteRequest {
  return quoteRequestSchema.parse(value)
}

/**
 * Lightning buyers top up. Repeat buyers with an Intents balance skip the
 * origin leg. Everyone else gets a single-use deposit address.
 */
export function selectPaymentPath(input: {
  buyerNetwork: string
  depositType?: 'ORIGIN_CHAIN' | 'INTENTS'
}): PaymentPath {
  if (input.buyerNetwork === 'lightning' || input.buyerNetwork.startsWith('lightning:')) {
    return 'lightning_topup'
  }
  if (input.depositType === 'INTENTS') return 'intents_balance'
  return 'deposit_address'
}

/**
 * Assemble the 402 requirement from a quote the caller already holds.
 * TODO: mint that quote with `@x402interop/intents`. This function does not.
 */
export function prepareQuote(
  request: QuoteRequest,
  quote: X402InteropQuoteInfo,
  scheme: string,
): PreparedQuote {
  return {
    path: selectPaymentPath({
      buyerNetwork: request.buyerNetwork,
      depositType: request.depositType,
    }),
    requirements: {
      scheme,
      network: request.sellerNetwork,
      asset: request.sellerAsset,
      amount: request.amount,
      payTo: request.sellerAddress,
      maxTimeoutSeconds: 300,
      extra: { ...quote, buyerAsset: request.buyerAsset },
    },
    extensions: { x402interop: x402InteropExtension(quote) },
  }
}
