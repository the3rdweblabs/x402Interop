// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type {
  PaymentPayload as X402PaymentPayload,
  PaymentRequired as X402PaymentRequired,
  PaymentRequirements as X402PaymentRequirements,
  ResourceInfo as X402ResourceInfo,
} from '@x402/core/types'

export type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  ResourceInfo,
} from '@x402/core/types'

/**
 * x402 v2 payment requirement. Field names follow the public x402 v2
 * specification published by the x402 Foundation.
 * `amount` is an atomic decimal string. `network` is a CAIP-2 identifier when
 * the chain has one.
 */
export interface PaymentRequirementsCompat {
  scheme: string
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra?: Record<string, unknown>
}

/** Resource metadata carried beside the payment, not inside the signature. */
export interface ResourceInfoCompat {
  url: string
  description?: string
  mimeType?: string
  serviceName?: string
  tags?: string[]
  iconUrl?: string
}

/** 402 body. `accepts` lists every way the client may pay. */
export interface PaymentRequiredCompat {
  x402Version: number
  error?: string
  resource: ResourceInfoCompat
  accepts: PaymentRequirementsCompat[]
  extensions?: Record<string, unknown>
}

/**
 * What the client sends back. `accepted` is the requirement it chose.
 * `payload` is scheme-specific and opaque at this layer.
 */
export interface PaymentPayloadCompat {
  x402Version: number
  resource?: ResourceInfoCompat
  accepted: PaymentRequirementsCompat
  payload: Record<string, unknown>
  extensions?: Record<string, unknown>
}

export type { X402PaymentRequirements, X402PaymentRequired, X402PaymentPayload, X402ResourceInfo }

/** True when `amount` is a positive atomic integer string. */
export function hasPaymentAmount(requirements: PaymentRequirements): boolean {
  return /^\d+$/.test(requirements.amount) && requirements.amount !== '0'
}
