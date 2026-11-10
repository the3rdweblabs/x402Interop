// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * NEAR Intents official SDK transport. The SDK package
 * (`@defuse-protocol/one-click-sdk-typescript`) is loaded lazily so the REST
 * path keeps working when it is not installed, and callers can fail over
 * between transports without touching their code.
 */

import type {
  DepositType,
  OneClickClient,
  OneClickDepositAck,
  OneClickDepositSubmission,
  OneClickQuote,
  OneClickQuoteRequest,
  OneClickStatus,
  OneClickSwapStatus,
  RecipientType,
  SwapType,
} from './index.js'
import { OneClickNotImplementedError } from './index.js'

export const ONE_CLICK_SDK_PACKAGE = '@defuse-protocol/one-click-sdk-typescript'

/** Structural view of the SDK's OpenAPI-generated surface (CancelablePromise). */
interface PromiseLike<T> {
  then<S>(onFulfilled: (value: T) => S, onRejected?: (reason: unknown) => S): Promise<S>
}

interface SdkQuote {
  depositAddress?: string
  depositMemo?: string
  amountIn: string
  amountInFormatted?: string
  minAmountIn: string
  amountOut: string
  amountOutFormatted?: string
  withdrawFee?: string
  refundFee?: string
  deadline?: string
  timeWhenInactive?: string
  timeEstimate: number
}

interface SdkQuoteRequest extends Record<string, unknown> {
  dry: boolean
}

interface SdkQuoteResponse {
  correlationId: string
  signature: string
  quoteRequest?: {
    deadline?: string
  }
  quote: SdkQuote
}

interface SdkStatusResponse {
  status: string
  swapDetails?: {
    originChainTxHashes?: Array<{ hash: string }>
    destinationChainTxHashes?: Array<{ hash: string }>
  }
}

interface SdkSurface {
  OpenAPI: { TOKEN?: string; BASE: string }
  OneClickService: {
    getQuote(request: Record<string, unknown>): PromiseLike<unknown>
    getExecutionStatus(depositAddress: string, depositMemo?: string): PromiseLike<unknown>
  }
}

const SWAP_TYPE_SDK = { EXACT_INPUT: 'EXACT_INPUT', EXACT_OUTPUT: 'EXACT_OUTPUT' } as const
const DEPOSIT_TYPE_SDK = { ORIGIN_CHAIN: 'ORIGIN_CHAIN', INTENTS: 'INTENTS' } as const
const RECIPIENT_TYPE_SDK = {
  DESTINATION_CHAIN: 'DESTINATION_CHAIN',
  INTENTS: 'INTENTS',
} as const

export class SdkOneClickClient implements OneClickClient {
  private readonly modulePromise: Promise<unknown>

  constructor(
    private readonly options: {
      token?: string
      /** Override the SDK's default 1Click base URL. */
      baseUrl?: string
      /** Used for `submitDeposit`, which the quote/status SDK surface does not expose. */
      restClient?: OneClickClient
      /** Injectable module for tests; defaults to lazy import of the SDK. */
      module?: unknown
    } = {},
  ) {
    if (options.module !== undefined) {
      this.modulePromise = Promise.resolve(options.module)
    } else {
      this.modulePromise = import(ONE_CLICK_SDK_PACKAGE).catch((error: unknown) => {
        throw new Error(
          `The NEAR Intents SDK (${ONE_CLICK_SDK_PACKAGE}) is not installed. ` +
            `Install it or use the REST transport. Cause: ${String(error)}`,
        )
      })
    }
  }

  private async surface(): Promise<SdkSurface> {
    const module = (await this.modulePromise) as SdkSurface
    if (this.options.baseUrl) module.OpenAPI.BASE = this.options.baseUrl
    if (this.options.token) module.OpenAPI.TOKEN = this.options.token
    return module
  }

  async quote(request: OneClickQuoteRequest): Promise<OneClickQuote> {
    const surface = await this.surface()
    const dry = request.dry === true
    const body: SdkQuoteRequest = {
      dry,
      swapType: SWAP_TYPE_SDK[request.swapType],
      slippageTolerance: request.slippageBps ?? 100,
      originAsset: request.originAsset,
      depositType: DEPOSIT_TYPE_SDK[request.depositType ?? 'ORIGIN_CHAIN'],
      destinationAsset: request.destinationAsset,
      amount: request.amount,
      refundTo: request.refundTo,
      refundType: DEPOSIT_TYPE_SDK[request.depositType ?? 'ORIGIN_CHAIN'],
      recipient: request.recipient,
      recipientType: RECIPIENT_TYPE_SDK[request.recipientType ?? 'DESTINATION_CHAIN'],
      deadline: request.deadline,
    }
    const response = (await surface.OneClickService.getQuote(body)) as SdkQuoteResponse
    const quote = response.quote
    if (!dry && !quote.depositAddress) {
      throw new Error('1Click SDK quote came back without a depositAddress')
    }
    return {
      quoteId: response.correlationId
        ? `1click-${response.correlationId}`
        : response.signature
          ? `1click-${Buffer.from(response.signature).toString('hex').slice(0, 16)}`
          : `1click-${quote.depositAddress || `dry-${Date.now()}`}`,
      depositAddress: quote.depositAddress ?? '',
      ...(quote.depositMemo ? { depositMemo: quote.depositMemo } : {}),
      originAmount: request.swapType === 'EXACT_OUTPUT' ? quote.amountIn : request.amount,
      destinationAmount: quote.amountOut,
      ...optionalString('minAmountIn', quote.minAmountIn),
      ...optionalString('withdrawFee', quote.withdrawFee),
      ...optionalString('refundFee', quote.refundFee),
      ...optionalString('amountInFormatted', quote.amountInFormatted),
      ...optionalString('amountOutFormatted', quote.amountOutFormatted),
      timeEstimateSeconds: NumericTime(quote.timeEstimate),
      // `quote.deadline` is the deposit-address inactivity deadline, not the
      // x402 payment window. Prefer the deadline echoed from the request.
      expiresAt: response.quoteRequest?.deadline ?? request.deadline,
    }
  }

  async status(depositAddress: string, depositMemo?: string): Promise<OneClickStatus> {
    const surface = await this.surface()
    const response = (await surface.OneClickService.getExecutionStatus(
      depositAddress,
      depositMemo,
    )) as SdkStatusResponse
    const swap = response.swapDetails
    return {
      status: response.status as OneClickSwapStatus,
      depositAddress,
      originTxHash: swap?.originChainTxHashes?.[0]?.hash,
      destinationTxHash: swap?.destinationChainTxHashes?.[0]?.hash,
    }
  }

  async submitDeposit(submission: OneClickDepositSubmission): Promise<OneClickDepositAck> {
    if (this.options.restClient) return this.options.restClient.submitDeposit(submission)
    throw new OneClickNotImplementedError('submitDeposit', 'POST /v0/deposit/submit')
  }

  setRestClient(restClient: OneClickClient): void {
    ;(this.options as { restClient?: OneClickClient }).restClient = restClient
  }
}

function NumericTime(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 45
}

function optionalString<K extends string>(
  key: K,
  value: string | undefined,
): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string }
}

export type { DepositType, RecipientType, SwapType }
