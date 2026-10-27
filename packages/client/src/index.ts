// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { PaymentRequirements } from '@x402interop/core'

import { SWAP_STATES, type SwapState } from './status-view.js'

export { SWAP_STATES, type SwapState }

export interface SearchServicesInput {
  query?: string
  network?: string
  maxPrice?: string
  limit?: number
}

export interface GetServiceInput {
  serviceId: string
}

export interface PreparePaymentInput {
  serviceId: string
  buyerNetwork: string
  buyerAsset: string
  buyerAddress: string
}

export interface PayAndFetchInput {
  serviceId: string
  buyerNetwork: string
}

export interface PaymentStatusInput {
  quoteId: string
}

export interface GetCreditInput {
  account: string
}

export interface CreditBalance {
  account: string
  spendable: string
  pending: string
}

export interface PaymentStatusView {
  quoteId: string
  state: SwapState
  originTxHash?: string
  destinationTxHash?: string
}

/** Buyer-facing client. The scaffold implementation performs no I/O. */
export interface X402InteropClient {
  preparePayment(input: PreparePaymentInput): Promise<PaymentRequirements>
  paymentStatus(input: PaymentStatusInput): Promise<PaymentStatusView>
  getCredit(input: GetCreditInput): Promise<CreditBalance>
}

export class ClientNotImplementedError extends Error {
  readonly operation: 'preparePayment' | 'paymentStatus' | 'getCredit'

  constructor(operation: 'preparePayment' | 'paymentStatus' | 'getCredit') {
    super(
      `${operation} is not implemented. TODO: call the facilitator. This scaffold makes no network call.`,
    )
    this.name = 'ClientNotImplementedError'
    this.operation = operation
  }
}

export function createScaffoldClient(): X402InteropClient {
  return {
    preparePayment() {
      return Promise.reject(new ClientNotImplementedError('preparePayment'))
    },
    paymentStatus() {
      return Promise.reject(new ClientNotImplementedError('paymentStatus'))
    },
    getCredit() {
      return Promise.reject(new ClientNotImplementedError('getCredit'))
    },
  }
}
