// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * The whole interop quote lifecycle lives here: classify the payment path,
 * mint a 1Click quote through a `OneClickClient`, and turn it into the 402
 * requirement + `x402interop` extension. Absorbed from the former
 * `@x402interop/quote` package in Phase 4.
 */

import {
  x402InteropExtension,
  type DeliveryMode,
  type Network,
  type PaymentRequirements,
  type X402InteropExtensions,
  type X402InteropQuoteInfo,
} from '@x402interop/core'
import { z } from 'zod'

import type { OneClickClient, SwapType } from './index.js'

/** Path the quote router takes. The facilitator classifies; 1Click executes. */
export type PaymentPath = 'deposit_address' | 'intents_balance' | 'lightning_topup'

export interface QuoteRequest {
  sellerNetwork: Network
  /** On-chain asset identifier used in the x402 requirement. */
  sellerAsset: string
  /** 1Click asset id. Falls back to `sellerAsset` for older callers. */
  sellerAssetId?: string
  sellerAddress: string
  amount: string
  buyerNetwork: Network
  /** On-chain asset identifier the buyer holds. */
  buyerAsset: string
  /** 1Click asset id. Falls back to `buyerAsset` for older callers. */
  buyerAssetId?: string
  buyerAddress: string
  deliveryMode: DeliveryMode
  depositType?: 'ORIGIN_CHAIN' | 'INTENTS'
  /** Defaults to EXACT_OUTPUT, the seller-priced path. */
  swapType?: SwapType
}

export interface PreparedQuote {
  path: PaymentPath
  requirements: PaymentRequirements
  extensions: X402InteropExtensions
}

export const quoteRequestSchema = z.object({
  sellerNetwork: z.string().min(1),
  sellerAsset: z.string().min(1),
  sellerAssetId: z.string().min(1).optional(),
  sellerAddress: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  buyerNetwork: z.string().min(1),
  buyerAsset: z.string().min(1),
  buyerAssetId: z.string().min(1).optional(),
  buyerAddress: z.string().min(1),
  deliveryMode: z.enum(['on_deposit', 'on_success', 'pending_push']),
  depositType: z.enum(['ORIGIN_CHAIN', 'INTENTS']).optional(),
  swapType: z.enum(['EXACT_INPUT', 'EXACT_OUTPUT']).optional(),
})

export function parseQuoteRequest(value: unknown): QuoteRequest {
  return quoteRequestSchema.parse(value) as QuoteRequest
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
 * Mint a quote through NEAR Intents (the caller chooses REST, SDK, auto, or
 * mock) and map it onto the x402 quote shape. No facilitator float: the
 * deposit address is single-use and the quote carries its own expiry.
 *
 * The seller is always the final recipient on its own chain. 1Click performs
 * the last-mile withdrawal to that address; x402Interop never substitutes an
 * Intents balance for the merchant's wallet.
 */
export async function mintQuote(
  request: QuoteRequest,
  client: OneClickClient,
  options: { dry?: boolean; slippageBps?: number } = {},
): Promise<X402InteropQuoteInfo> {
  const originAsset = request.buyerAssetId ?? request.buyerAsset
  const destinationAsset = request.sellerAssetId ?? request.sellerAsset
  const recipientType = 'DESTINATION_CHAIN' as const
  const swap = await client.quote({
    originAsset,
    destinationAsset,
    amount: request.amount,
    recipient: request.sellerAddress,
    refundTo: request.buyerAddress,
    deadline: new Date(Date.now() + 1_800_000).toISOString(), // 30m, chain-confirm safe
    swapType: request.swapType ?? 'EXACT_OUTPUT',
    depositType: request.depositType === 'INTENTS' ? 'INTENTS' : 'ORIGIN_CHAIN',
    recipientType,
    ...(options.slippageBps !== undefined ? { slippageBps: options.slippageBps } : {}),
    dry: options.dry === true,
  })
  return {
    quoteId: swap.quoteId,
    depositAddress: swap.depositAddress,
    ...(swap.depositMemo ? { depositMemo: swap.depositMemo } : {}),
    originNetwork: request.buyerNetwork,
    originAsset,
    originAmount: swap.originAmount,
    destinationAmount: swap.destinationAmount,
    ...(swap.minAmountIn ? { minAmountIn: swap.minAmountIn } : {}),
    ...(swap.withdrawFee ? { withdrawFee: swap.withdrawFee } : {}),
    ...(swap.refundFee ? { refundFee: swap.refundFee } : {}),
    ...(swap.amountInFormatted ? { amountInFormatted: swap.amountInFormatted } : {}),
    ...(swap.amountOutFormatted ? { amountOutFormatted: swap.amountOutFormatted } : {}),
    expiresAt: swap.expiresAt || new Date(Date.now() + 1_800_000).toISOString(),
    timeEstimateSeconds: swap.timeEstimateSeconds,
    deliveryMode: request.deliveryMode,
    refundTo: request.buyerAddress,
    recipientType,
  }
}

/**
 * Turn a minted quote into the 402 requirement and extension. The requirement
 * still carries the vacant-interop shape; `extra.recipient` is the seller.
 *
 * `maxTimeoutSeconds` follows the quote's own expiry so the advertised payment
 * window and the signed `expiresAt` cannot disagree. A quote that has already
 * expired keeps the historical 300-second default; the facilitator rejects it
 * on the expiry check regardless.
 */
export function quoteToRequirements(
  request: QuoteRequest,
  quote: X402InteropQuoteInfo,
  scheme: string,
  exactExtra: Record<string, unknown> = {},
): PreparedQuote {
  const remainingMs = Date.parse(quote.expiresAt) - Date.now()
  const maxTimeoutSeconds =
    Number.isFinite(remainingMs) && remainingMs > 0
      ? Math.min(86_400, Math.ceil(remainingMs / 1000))
      : 300

  if (scheme === 'exact') {
    return {
      path: selectPaymentPath({
        buyerNetwork: request.buyerNetwork,
        depositType: request.depositType,
      }),
      requirements: {
        scheme,
        network: request.buyerNetwork,
        asset: request.buyerAsset,
        amount: quote.originAmount ?? request.amount,
        payTo: quote.depositAddress,
        maxTimeoutSeconds,
        extra: {
          ...quote,
          ...exactExtra,
          sellerNetwork: request.sellerNetwork,
          sellerAsset: request.sellerAsset,
          sellerAddress: request.sellerAddress,
          buyerAsset: request.buyerAsset,
        },
      },
      extensions: { x402interop: x402InteropExtension(quote) },
    }
  }

  return {
    path: selectPaymentPath({
      buyerNetwork: request.buyerNetwork,
      depositType: request.depositType,
    }),
    requirements: {
      scheme,
      network: request.sellerNetwork,
      asset: request.sellerAsset,
      amount: quote.destinationAmount ?? request.amount,
      payTo: quote.depositAddress, // deposit address on the wire
      maxTimeoutSeconds,
      extra: {
        ...quote,
        buyerAsset: request.buyerAsset,
        recipient: request.sellerAddress,
      },
    },
    extensions: { x402interop: x402InteropExtension(quote) },
  }
}
