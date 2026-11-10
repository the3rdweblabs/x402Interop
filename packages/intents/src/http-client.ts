// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type {
  OneClickClient,
  OneClickDepositAck,
  OneClickDepositSubmission,
  OneClickQuote,
  OneClickQuoteRequest,
  OneClickStatus,
  OneClickSwapStatus,
} from './index.js'

/** An HTTP failure from 1Click that keeps the upstream status code. */
export class OneClickHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'OneClickHttpError'
  }
}

interface QuoteBody {
  depositAddress?: string
  depositMemo?: string
  amountIn?: string
  amountInFormatted?: string
  minAmountIn?: string
  amountOut?: string
  amountOutFormatted?: string
  withdrawFee?: string
  refundFee?: string
  timeEstimate?: number
  timeEstimateSeconds?: number
  deadline?: string
  timeWhenInactive?: string
}

interface QuoteResponse extends QuoteBody {
  quote?: QuoteBody
  quoteRequest?: {
    deadline?: string
  }
  correlationId?: string
  quoteId?: string
}

interface ChainHash {
  hash?: string
}

interface StatusResponse {
  status?: string
  depositAddress?: string
  originTxHash?: string
  destinationTxHash?: string
  txHash?: string
  swapDetails?: {
    originChainTxHashes?: Array<string | ChainHash>
    destinationChainTxHashes?: Array<string | ChainHash>
  }
  quoteResponse?: {
    quote?: {
      depositAddress?: string
    }
  }
}

function firstHash(hashes: Array<string | ChainHash> | undefined): string | undefined {
  const first = hashes?.[0]
  if (typeof first === 'string') return first
  return first?.hash
}

function numeric(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value as number)) : 45
}

function optionalString<K extends string>(
  key: K,
  value: string | undefined,
): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string }
}

/**
 * NEAR Intents 1Click REST transport.
 *
 * The live API requires `dry` on every quote. A non-dry quote nests its
 * pricing under `quote` and returns the single-use deposit address there;
 * status hashes live under `swapDetails`. Older deployments used a flat
 * response, so both shapes are read.
 */
export class HttpOneClickClient implements OneClickClient {
  constructor(
    readonly baseUrl: string = 'https://1click.chaindefuser.com',
    private readonly apiKey?: string,
  ) {}

  private async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(init.headers as Record<string, string>),
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const res = await fetch(url, {
      ...init,
      headers,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new OneClickHttpError(
        res.status,
        `1Click API error: ${res.status} ${res.statusText} - ${text}`,
      )
    }

    return res.json() as Promise<T>
  }

  async quote(request: OneClickQuoteRequest): Promise<OneClickQuote> {
    const dry = request.dry === true
    const quoteBody = {
      originAsset: request.originAsset,
      destinationAsset: request.destinationAsset,
      amount: request.amount,
      recipient: request.recipient,
      refundTo: request.refundTo,
      deadline: request.deadline,
      slippageTolerance: request.slippageBps ?? 100,
      swapType: request.swapType || 'EXACT_OUTPUT',
      depositType: request.depositType || 'ORIGIN_CHAIN',
      recipientType: request.recipientType || 'DESTINATION_CHAIN',
      refundType: request.depositType || 'ORIGIN_CHAIN',
      dry,
    }

    const response = await this.fetchJson<QuoteResponse>('/v0/quote', {
      method: 'POST',
      body: JSON.stringify(quoteBody),
    })
    const quote = response.quote ?? response
    const depositAddress = quote.depositAddress ?? response.depositAddress ?? ''
    if (!dry && depositAddress.length === 0) {
      throw new Error('1Click quote came back without a depositAddress')
    }

    const correlationId = response.correlationId ?? response.quoteId
    return {
      quoteId: correlationId
        ? `1click-${correlationId}`
        : `1click-${depositAddress || `dry-${Date.now()}`}`,
      depositAddress,
      ...(quote.depositMemo || response.depositMemo
        ? { depositMemo: quote.depositMemo ?? response.depositMemo }
        : {}),
      originAmount: quote.amountIn ?? response.amountIn ?? request.amount,
      destinationAmount: quote.amountOut ?? response.amountOut ?? request.amount,
      ...optionalString('minAmountIn', quote.minAmountIn ?? response.minAmountIn),
      ...optionalString('withdrawFee', quote.withdrawFee ?? response.withdrawFee),
      ...optionalString('refundFee', quote.refundFee ?? response.refundFee),
      ...optionalString('amountInFormatted', quote.amountInFormatted ?? response.amountInFormatted),
      ...optionalString(
        'amountOutFormatted',
        quote.amountOutFormatted ?? response.amountOutFormatted,
      ),
      timeEstimateSeconds: numeric(quote.timeEstimate ?? quote.timeEstimateSeconds),
      // `quote.deadline` is when the deposit address itself goes inactive (the
      // API currently returns three days). The x402 payment window is the
      // deadline we requested, which the API echoes in `quoteRequest`.
      expiresAt: response.quoteRequest?.deadline ?? request.deadline,
    }
  }

  async status(depositAddress: string, depositMemo?: string): Promise<OneClickStatus> {
    const memo = depositMemo ? `&depositMemo=${encodeURIComponent(depositMemo)}` : ''
    const data = await this.fetchJson<StatusResponse>(
      `/v0/status?depositAddress=${encodeURIComponent(depositAddress)}${memo}`,
      {
        method: 'GET',
      },
    )
    if (!data.status) {
      throw new Error('1Click status response did not include a status')
    }
    return {
      status: data.status as OneClickSwapStatus,
      depositAddress:
        data.depositAddress ?? data.quoteResponse?.quote?.depositAddress ?? depositAddress,
      originTxHash:
        firstHash(data.swapDetails?.originChainTxHashes) ?? data.originTxHash ?? data.txHash,
      destinationTxHash:
        firstHash(data.swapDetails?.destinationChainTxHashes) ?? data.destinationTxHash,
    }
  }

  async submitDeposit(submission: OneClickDepositSubmission): Promise<OneClickDepositAck> {
    try {
      const data = await this.fetchJson<{ accepted?: boolean }>('/v0/deposit/submit', {
        method: 'POST',
        body: JSON.stringify(submission),
      })
      return { accepted: data.accepted ?? true }
    } catch {
      return { accepted: false }
    }
  }
}
