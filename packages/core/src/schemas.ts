// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { z } from 'zod'

import type { X402InteropExtension, X402InteropQuoteInfo } from './extensions.js'
import type { PaymentRequirements } from './payments.js'

export const deliveryModeSchema = z.enum(['on_deposit', 'on_success', 'pending_push'])

export const paymentRequirementsSchema = z.object({
  scheme: z.string().min(1),
  network: z.string().min(1),
  asset: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  payTo: z.string().min(1),
  maxTimeoutSeconds: z.number().int().nonnegative(),
  extra: z.record(z.string(), z.unknown()).optional(),
})

export const x402InteropQuoteInfoSchema = z.object({
  quoteId: z.string().min(1),
  depositAddress: z.string().min(1),
  originNetwork: z.string().min(1),
  originAsset: z.string().min(1),
  originAmount: z.string().regex(/^\d+$/),
  expiresAt: z.iso.datetime(),
  timeEstimateSeconds: z.number().int().nonnegative(),
  deliveryMode: deliveryModeSchema,
  refundTo: z.string().min(1),
})

export const x402InteropExtensionSchema = z.object({
  info: x402InteropQuoteInfoSchema,
  schema: z.record(z.string(), z.unknown()),
})

export function parsePaymentRequirements(value: unknown): PaymentRequirements {
  return paymentRequirementsSchema.parse(value)
}

export function parseX402InteropQuoteInfo(value: unknown): X402InteropQuoteInfo {
  return x402InteropQuoteInfoSchema.parse(value)
}

export function parseX402InteropExtension(value: unknown): X402InteropExtension {
  return x402InteropExtensionSchema.parse(value)
}
