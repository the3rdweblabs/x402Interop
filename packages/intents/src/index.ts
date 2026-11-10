// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { z } from 'zod'

/** Where the 1Click deposit is funded from. */
export type DepositType = 'ORIGIN_CHAIN' | 'INTENTS'

/** Where the filled amount is delivered. */
export type RecipientType = 'DESTINATION_CHAIN' | 'INTENTS'

/** EXACT_OUTPUT is the seller path: the recipient amount is fixed. */
export type SwapType = 'EXACT_INPUT' | 'EXACT_OUTPUT'

/**
 * Wire statuses returned by 1Click `GET /v0/status`.
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
  /**
   * Ask 1Click for pricing only. A dry quote has no deposit address, so it
   * cannot be used to build a payment requirement.
   */
  dry?: boolean
}

export interface OneClickQuote {
  quoteId: string
  depositAddress: string
  /** Some origin chains (XRPL, TON, ...) require a memo/tag with the deposit. */
  depositMemo?: string
  originAmount: string
  destinationAmount: string
  /** Minimum origin amount 1Click will accept for this quote. */
  minAmountIn?: string
  /** Withdrawal fee to the destination chain, in destination-asset units. */
  withdrawFee?: string
  /** Refund fee to the origin chain, in origin-asset units. */
  refundFee?: string
  amountInFormatted?: string
  amountOutFormatted?: string
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
  /**
   * Read the deposit status. `depositMemo` is required by 1Click for origin
   * chains that attach a memo/tag to the quote deposit address.
   */
  status(depositAddress: string, depositMemo?: string): Promise<OneClickStatus>
  submitDeposit(submission: OneClickDepositSubmission): Promise<OneClickDepositAck>
}

export class OneClickNotImplementedError extends Error {
  readonly operation: 'quote' | 'status' | 'submitDeposit'
  readonly upstream: string

  constructor(operation: 'quote' | 'status' | 'submitDeposit', upstream: string) {
    super(
      `${operation} is not implemented in this client. Call 1Click ${upstream} or use another transport. No network call was made.`,
    )
    this.name = 'OneClickNotImplementedError'
    this.operation = operation
    this.upstream = upstream
  }
}

/**
 * In-memory mock client for tests and local development. Produces deterministic
 * single-use deposit addresses and statuses without any network calls.
 */
export class MockOneClickClient implements OneClickClient {
  private readonly quotes = new Map<string, OneClickQuote>()
  private readonly statuses = new Map<string, OneClickSwapStatus>()
  private readonly originTxHashes = new Map<string, string>()

  constructor(private readonly seed: string = 'x402interop-mock') {}

  private depositAddressFor(request: OneClickQuoteRequest): string {
    const payload = `${this.seed}:${request.originAsset}:${request.destinationAsset}:${request.amount}:${request.recipient}:${request.refundTo}`
    const hex = Buffer.from(payload).toString('hex')
    return `0x1c${hex.slice(0, 38)}`
  }

  async quote(request: OneClickQuoteRequest): Promise<OneClickQuote> {
    const depositAddress = request.dry === true ? '' : this.depositAddressFor(request)
    const quote: OneClickQuote = {
      quoteId: depositAddress
        ? `mock-${Buffer.from(depositAddress).toString('hex').slice(0, 16)}`
        : `mock-dry-${Date.now()}`,
      depositAddress,
      originAmount: request.amount,
      destinationAmount: request.amount,
      timeEstimateSeconds: 45,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    }
    if (depositAddress) {
      this.quotes.set(depositAddress, quote)
      this.statuses.set(depositAddress, 'PENDING_DEPOSIT')
    }
    return quote
  }

  async status(depositAddress: string): Promise<OneClickStatus> {
    const state = this.statuses.get(depositAddress) ?? 'PENDING_DEPOSIT'
    const submitted = this.originTxHashes.get(depositAddress)
    return {
      status: state,
      depositAddress,
      originTxHash: state === 'PENDING_DEPOSIT' ? undefined : (submitted ?? '0xmockorigin'),
      destinationTxHash: state === 'SUCCESS' ? '0xmockdest' : undefined,
    }
  }

  async submitDeposit(submission: OneClickDepositSubmission): Promise<OneClickDepositAck> {
    if (this.quotes.has(submission.depositAddress)) {
      this.statuses.set(submission.depositAddress, 'KNOWN_DEPOSIT_TX')
      this.originTxHashes.set(submission.depositAddress, submission.txHash)
      return { accepted: true }
    }
    return { accepted: false }
  }

  setStatus(depositAddress: string, status: OneClickSwapStatus): void {
    this.statuses.set(depositAddress, status)
  }
}

/**
 * Explicit deterministic cross-chain simulator. It has the same lifecycle
 * surface as 1Click but never contacts a network or moves funds.
 */
export class SimulatorOneClickClient extends MockOneClickClient {
  constructor(seed = 'x402interop-simulator') {
    super(seed)
  }
}

/**
 * True for the in-process mock and the simulator. Live REST and SDK clients
 * are not instances of `MockOneClickClient`, so a deposit cannot be advanced
 * through this check.
 */
export function isSimulatedOneClickClient(client: OneClickClient): client is MockOneClickClient {
  return client instanceof MockOneClickClient
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
  dry: z.boolean().optional(),
})

export function parseOneClickQuoteRequest(value: unknown): OneClickQuoteRequest {
  return oneClickQuoteRequestSchema.parse(value)
}

export {
  createOneClickClient,
  type CreateOneClickClientOptions,
  type OneClickClientType,
} from './factory.js'
export { HttpOneClickClient } from './http-client.js'
export { ONE_CLICK_SDK_PACKAGE, SdkOneClickClient } from './sdk-client.js'
export { ResilientOneClickClient } from './resilient.js'
export { fetchTokens, mapChainToBlockchain, resolveAssetId } from './asset-mapping.js'
export {
  mintQuote,
  parseQuoteRequest,
  quoteRequestSchema,
  quoteToRequirements,
  selectPaymentPath,
  type PaymentPath,
  type PreparedQuote,
  type QuoteRequest,
} from './quote.js'
