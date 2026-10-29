// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/** Seller-chosen moment when the resource may be served. */
export type DeliveryMode = 'on_deposit' | 'on_success' | 'pending_push'

/**
 * Quote facts the facilitator binds to one payment. The v2 extension key is
 * `extensions.x402interop`. The scheme draft also copies these fields into
 * `PaymentRequirements.extra` so a client that only reads `extra` still sees them.
 */
export interface X402InteropQuoteInfo {
  quoteId: string
  depositAddress: string
  originNetwork: string
  originAsset: string
  originAmount: string
  expiresAt: string
  timeEstimateSeconds: number
  deliveryMode: DeliveryMode
  refundTo: string
}

/** v2 extension object: server `info` plus a JSON Schema for that info. */
export interface X402InteropExtension {
  info: X402InteropQuoteInfo
  schema: Record<string, unknown>
}

/** Extensions map containing the x402interop entry. */
export interface X402InteropExtensions {
  x402interop: X402InteropExtension
}

export const X402INTEROP_EXTENSION_KEY = 'x402interop' as const

export function x402InteropExtension(info: X402InteropQuoteInfo): X402InteropExtension {
  return {
    info,
    schema: {
      type: 'object',
      description:
        'Cross-chain quote bound to one x402 payment. The 1Click API key is never included.',
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read `extensions.x402interop` when the value has the extension shape. */
export function readX402InteropExtension(
  extensions: Record<string, unknown> | undefined,
): X402InteropExtension | undefined {
  if (!extensions) return undefined
  const value = extensions[X402INTEROP_EXTENSION_KEY]
  if (!isRecord(value)) return undefined
  if (!isRecord(value.info)) return undefined
  return value as unknown as X402InteropExtension
}
