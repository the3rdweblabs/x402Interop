// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { PaymentPayload, PaymentRequirements } from './payments.js'

export interface VerifyRequest {
  x402Version: number
  paymentPayload: PaymentPayload
  paymentRequirements: PaymentRequirements
}

export interface VerifyResponse {
  isValid: boolean
  invalidReason?: string
  invalidMessage?: string
  payer?: string
  extensions?: Record<string, unknown>
  extra?: Record<string, unknown>
}

export interface SettleRequest {
  x402Version: number
  paymentPayload: PaymentPayload
  paymentRequirements: PaymentRequirements
}

/**
 * Settle response. `transaction` is required by the spec and is an empty
 * string when nothing was broadcast.
 */
export interface SettleResponse {
  success: boolean
  errorReason?: string
  errorMessage?: string
  payer?: string
  transaction: string
  network: string
  amount?: string
  extensions?: Record<string, unknown>
  extra?: Record<string, unknown>
}

export interface SupportedKind {
  x402Version: number
  scheme: string
  network: string
  extra?: Record<string, unknown>
}

export interface SupportedResponse {
  kinds: SupportedKind[]
  extensions: string[]
  signers: Record<string, string[]>
}
