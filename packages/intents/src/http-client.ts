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
} from './index.js'

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
      throw new Error(`1Click API error: ${res.status} ${res.statusText} - ${text}`)
    }

    return res.json() as Promise<T>
  }

  async quote(request: OneClickQuoteRequest): Promise<OneClickQuote> {
    const quoteBody = {
      originAsset: request.originAsset,
      destinationAsset: request.destinationAsset,
      amount: request.amount,
      recipient: request.recipient,
      refundTo: request.refundTo,
      deadline: request.deadline,
      slippageTolerance: request.slippageBps ?? 100, // 1% default, in basis points as integer
      swapType: request.swapType || 'EXACT_OUTPUT',
      depositType: request.depositType || 'ORIGIN_CHAIN',
      recipientType: request.recipientType || 'DESTINATION_CHAIN',
      refundType: (request as any).refundType || request.depositType || 'ORIGIN_CHAIN',
    }
    // Try both v0/quote and /quote for compatibility
    try {
      const data = await this.fetchJson<any>('/v0/quote', {
        method: 'POST',
        body: JSON.stringify(quoteBody),
      })
      return {
        quoteId: data.quoteId || data.id || data.quote?.quoteId,
        depositAddress:
          data.depositAddress || data.address || data.quote?.depositAddress || data.deposit?.address,
        originAmount: data.originAmount || request.amount,
        destinationAmount: data.destinationAmount || request.amount,
        timeEstimateSeconds: data.timeEstimateSeconds || 45,
        expiresAt: data.expiresAt || data.deadline || new Date(Date.now() + 300000).toISOString(),
      }
    } catch (err) {
      // Fallback to /quote
      const data = await this.fetchJson<any>('/quote', {
        method: 'POST',
        body: JSON.stringify(quoteBody),
      })
      return {
        quoteId: data.quoteId || data.id || data.quote?.quoteId,
        depositAddress:
          data.depositAddress || data.address || data.quote?.depositAddress || data.deposit?.address,
        originAmount: data.originAmount || request.amount,
        destinationAmount: data.destinationAmount || request.amount,
        timeEstimateSeconds: data.timeEstimateSeconds || 45,
        expiresAt: data.expiresAt || data.deadline || new Date(Date.now() + 300000).toISOString(),
      }
    }
  }

  async status(depositAddress: string): Promise<OneClickStatus> {
    try {
      const data = await this.fetchJson<any>(
        `/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
        {
          method: 'GET',
        },
      )
      return {
        status: data.status,
        depositAddress: data.depositAddress || depositAddress,
        originTxHash: data.originTxHash || data.txHash,
        destinationTxHash: data.destinationTxHash,
      }
    } catch (err) {
      const data = await this.fetchJson<any>(
        `/status?depositAddress=${encodeURIComponent(depositAddress)}`,
        {
          method: 'GET',
        },
      )
      return {
        status: data.status,
        depositAddress: data.depositAddress || depositAddress,
        originTxHash: data.originTxHash || data.txHash,
        destinationTxHash: data.destinationTxHash,
      }
    }
  }

  async submitDeposit(submission: OneClickDepositSubmission): Promise<OneClickDepositAck> {
    try {
      const data = await this.fetchJson<any>('/v0/deposit/submit', {
        method: 'POST',
        body: JSON.stringify(submission),
      })
      return { accepted: data.accepted ?? true }
    } catch (err) {
      try {
        const data = await this.fetchJson<any>('/deposit/submit', {
          method: 'POST',
          body: JSON.stringify(submission),
        })
        return { accepted: data.accepted ?? true }
      } catch {
        return { accepted: false }
      }
    }
  }
}
