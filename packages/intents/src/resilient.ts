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

/**
 * Tries transports in order and remembers the first one that answered, so a
 * missing SDK degrades to REST on the first call and never retries imports
 * on the hot path. Rebuilds the preference when a transport starts failing.
 */
export class ResilientOneClickClient implements OneClickClient {
  private preferred: number | undefined

  constructor(private readonly transports: readonly OneClickClient[]) {
    if (transports.length === 0) throw new Error('ResilientOneClickClient needs ≥ 1 transport')
  }

  private order(): OneClickClient[] {
    const list = [...this.transports]
    if (this.preferred !== undefined) {
      const preferred = list.splice(this.preferred, 1)[0]
      if (preferred) list.unshift(preferred)
    }
    return list
  }

  private async through<T>(operation: (client: OneClickClient) => Promise<T>): Promise<T> {
    let lastError: unknown
    for (const [index, client] of this.order().entries()) {
      try {
        const result = await operation(client)
        this.preferred = this.transports.indexOf(client)
        return result
      } catch (error) {
        lastError = error
        if (index === this.transports.length - 1) break
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`all ${this.transports.length} OneClick transports failed`)
  }

  quote(request: OneClickQuoteRequest): Promise<OneClickQuote> {
    return this.through((client) => client.quote(request))
  }

  status(depositAddress: string, depositMemo?: string): Promise<OneClickStatus> {
    return this.through((client) => client.status(depositAddress, depositMemo))
  }

  submitDeposit(submission: OneClickDepositSubmission): Promise<OneClickDepositAck> {
    return this.through((client) => client.submitDeposit(submission))
  }
}
