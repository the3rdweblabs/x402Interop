// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { z } from 'zod'

/** Where the 1Click deposit is funded from. */
export type DepositType = 'ORIGIN_CHAIN' | 'INTENTS'

/** Where the filled amount is delivered. */
export type RecipientType = 'DESTINATION_CHAIN' | 'INTENTS'

/** EXACT_OUTPUT is the seller path: the recipient amount is fixed. */
export type SwapType = 'EXACT_INPUT' | 'EXACT_OUTPUT'

/**
 * Wire statuses returned by 1Click `GET /v0/status`. The scaffold names them
 * so callers can map them later; it does not poll.
 */
export type OneClickSwapStatus =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'INCOMPLETE_DEPOSIT'
  | 'REFUNDED'
  | 'FAILED'

export interface OneClickQuoteRequest {
  originAsset: string
  destinationAsset: string
  amount: string
  recipient: string
  refundTo: string
  deadline: string
  slippageBps?: number
  swapType: SwapType
  depositType?: DepositType
  recipientType?: RecipientType
}

export interface OneClickQuote {
  quoteId: string
  depositAddress: string
  originAmount: string
  destinationAmount: string
  timeEstimateSeconds: number
  expiresAt: string
}

export interface OneClickStatus {
  status: OneClickSwapStatus
  depositAddress: string
  originTxHash?: string
  destinationTxHash?: string
}

export interface OneClickDepositSubmission {
  depositAddress: string
  txHash: string
}

export interface OneClickDepositAck {
  accepted: boolean
}

/** Typed 1Click surface. Implementations must not log the API key. */
export interface OneClickClient {
  quote(request: OneClickQuoteRequest): Promise<OneClickQuote>
  status(depositAddress: string): Promise<OneClickStatus>
  submitDeposit(submission: OneClickDepositSubmission): Promise<OneClickDepositAck>
}

export class OneClickNotImplementedError extends Error {
  readonly operation: 'quote' | 'status' | 'submitDeposit'
  readonly upstream: string

  constructor(operation: 'quote' | 'status' | 'submitDeposit', upstream: string) {
    super(
      `${operation} is not implemented. TODO: call 1Click ${upstream}. This scaffold makes no network call.`,
    )
    this.name = 'OneClickNotImplementedError'
    this.operation = operation
    this.upstream = upstream
  }
}

/**
 * Placeholder client. Methods reject before any HTTP request so a missing
 * JWT cannot leak and tests stay offline.
 */
export class ScaffoldOneClickClient implements OneClickClient {
  constructor(readonly baseUrl: string) {}

  quote(_request: OneClickQuoteRequest): Promise<OneClickQuote> {
    return Promise.reject(new OneClickNotImplementedError('quote', 'POST /v0/quote'))
  }

  status(_depositAddress: string): Promise<OneClickStatus> {
    return Promise.reject(new OneClickNotImplementedError('status', 'GET /v0/status'))
  }

  submitDeposit(_submission: OneClickDepositSubmission): Promise<OneClickDepositAck> {
    return Promise.reject(
      new OneClickNotImplementedError('submitDeposit', 'POST /v0/deposit/submit'),
    )
  }
}

export const oneClickQuoteRequestSchema = z.object({
  originAsset: z.string().min(1),
  destinationAsset: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  recipient: z.string().min(1),
  refundTo: z.string().min(1),
  deadline: z.string().min(1),
  slippageBps: z.number().int().nonnegative().optional(),
  swapType: z.enum(['EXACT_INPUT', 'EXACT_OUTPUT']),
  depositType: z.enum(['ORIGIN_CHAIN', 'INTENTS']).optional(),
  recipientType: z.enum(['DESTINATION_CHAIN', 'INTENTS']).optional(),
})

export function parseOneClickQuoteRequest(value: unknown): OneClickQuoteRequest {
  return oneClickQuoteRequestSchema.parse(value)
}
