// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

/**
 * x402 v2 payment requirement. Field names follow the public v2 specification.
 * `amount` is an atomic decimal string. `network` is a CAIP-2 identifier when
 * the chain has one.
 */
export interface PaymentRequirements {
  scheme: string
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra?: Record<string, unknown>
}

/** Resource metadata carried beside the payment, not inside the signature. */
export interface ResourceInfo {
  url: string
  description?: string
  mimeType?: string
  serviceName?: string
  tags?: string[]
  iconUrl?: string
}

/** 402 body. `accepts` lists every way the client may pay. */
export interface PaymentRequired {
  x402Version: number
  error?: string
  resource: ResourceInfo
  accepts: PaymentRequirements[]
  extensions?: Record<string, unknown>
}

/**
 * What the client sends back. `accepted` is the requirement it chose.
 * `payload` is scheme-specific and opaque at this layer.
 */
export interface PaymentPayload {
  x402Version: number
  resource?: ResourceInfo
  accepted: PaymentRequirements
  payload: Record<string, unknown>
  extensions?: Record<string, unknown>
}

/** True when `amount` is a positive atomic integer string. */
export function hasPaymentAmount(requirements: PaymentRequirements): boolean {
  return /^\d+$/.test(requirements.amount) && requirements.amount !== '0'
}
