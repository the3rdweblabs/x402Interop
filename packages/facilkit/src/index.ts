// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  isInteropScheme,
  paymentRequirementsSchema,
  X402_VERSION,
  type SettleRequest,
  type SettleResponse,
  type SupportedKind,
  type SupportedResponse,
  type VerifyRequest,
  type VerifyResponse,
} from '@x402interop/core'
import { z } from 'zod'
import { settleWithAdapter, verifyWithAdapter } from './verifier.js'

export { settleWithAdapter, verifyWithAdapter } from './verifier.js'

const paymentPayloadSchema = z.looseObject({
  x402Version: z.number(),
  accepted: paymentRequirementsSchema,
  payload: z.record(z.string(), z.unknown()),
  resource: z.any().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
})

/** Body shared by `/verify` and `/settle` in the scaffold. */
export const facilitatorRequestSchema = z.object({
  x402Version: z.number(),
  paymentPayload: paymentPayloadSchema,
  paymentRequirements: paymentRequirementsSchema,
})

export function supportedResponse(kinds: SupportedKind[]): SupportedResponse {
  return {
    kinds,
    extensions: ['x402interop'],
    signers: {},
  }
}

function validateInteropBinding(
  request: VerifyRequest,
): { ok: true } | { ok: false; reason: string; message?: string } {
  const requirements = request.paymentRequirements as any
  const payload = request.paymentPayload as any
  const binding = payload?.payload?.binding ?? payload?.binding
  if (!binding || typeof binding !== 'object') {
    return { ok: false, reason: 'missing_binding', message: 'x402interop payload requires binding' }
  }
  const quoteId = binding.quoteId
  const depositAddress = binding.depositAddress
  const nonce = binding.nonce
  const expiresAt = binding.expiresAt
  if (typeof quoteId !== 'string' || quoteId.length === 0) {
    return { ok: false, reason: 'invalid_binding', message: 'binding.quoteId is required' }
  }
  if (typeof depositAddress !== 'string' || depositAddress.length === 0) {
    return { ok: false, reason: 'invalid_binding', message: 'binding.depositAddress is required' }
  }
  if (typeof nonce !== 'string' || nonce.length === 0) {
    return { ok: false, reason: 'nonce_reused', message: 'binding.nonce is required' }
  }
  if (typeof expiresAt !== 'string' || expiresAt.length === 0) {
    return { ok: false, reason: 'quote_expired', message: 'binding.expiresAt is required' }
  }
  const extra = requirements.extra as any
  if (extra?.quoteId && extra.quoteId !== quoteId) {
    return { ok: false, reason: 'amount_mismatch', message: 'binding.quoteId does not match quote' }
  }
  if (extra?.depositAddress && extra.depositAddress !== depositAddress) {
    return { ok: false, reason: 'amount_mismatch', message: 'binding.depositAddress does not match quote' }
  }
  if (extra?.expiresAt && typeof extra.expiresAt === 'string') {
    if (expiresAt > extra.expiresAt) {
      return { ok: false, reason: 'quote_expired', message: 'binding.expiresAt exceeds quote expiry' }
    }
  }
  return { ok: true }
}

/**
 * Structural checks + adapter verification
 */
export async function verifyPayment(
  request: VerifyRequest,
  now: Date = new Date(),
): Promise<VerifyResponse> {
  if (request.x402Version !== X402_VERSION) {
    return { isValid: false, invalidReason: 'unsupported_version' }
  }
  if (request.paymentPayload.accepted.scheme !== request.paymentRequirements.scheme) {
    return { isValid: false, invalidReason: 'scheme_mismatch' }
  }
  const expiresAt = (request.paymentRequirements as any).extra?.expiresAt
  if (typeof expiresAt === 'string') {
    const expiry = Date.parse(expiresAt)
    if (Number.isFinite(expiry) && expiry <= now.getTime()) {
      return { isValid: false, invalidReason: 'quote_expired' }
    }
  }
  if (isInteropScheme(request.paymentRequirements.scheme)) {
    const payload = request.paymentPayload as any
    const binding = payload?.payload?.binding ?? payload?.binding
    const extra = (request.paymentRequirements as any).extra
    if (binding || extra?.quoteId || extra?.depositAddress) {
      const bindingCheck = validateInteropBinding(request)
      if (!bindingCheck.ok) {
        return {
          isValid: false,
          invalidReason: bindingCheck.reason,
          invalidMessage: bindingCheck.message,
        }
      }
    }
  }
  // Try adapter-based verification
  try {
    const adapterResult = await verifyWithAdapter(
      request.paymentPayload as any,
      request.paymentRequirements,
    )
    return adapterResult
  } catch (err) {
    return {
      isValid: false,
      invalidReason: 'not_implemented',
      invalidMessage: err instanceof Error ? err.message : 'Signature checks failed',
    }
  }
}

export async function settlePayment(
  request: SettleRequest,
  now: Date = new Date(),
): Promise<SettleResponse> {
  const verified = await verifyPayment(request, now)
  if (verified.invalidReason && verified.invalidReason !== 'not_implemented') {
    return {
      success: false,
      errorReason: verified.invalidReason,
      errorMessage: verified.invalidMessage,
      transaction: '',
      network: request.paymentRequirements.network,
    }
  }
  try {
    const result = await settleWithAdapter(request.paymentPayload as any, request.paymentRequirements)
    if (result && typeof result === 'object') {
      if ('success' in result) {
        return result as SettleResponse
      }
      if ('errorReason' in result) {
        if (result.errorReason === 'not_implemented') {
          return {
            success: false,
            errorReason: 'not_implemented',
            errorMessage: 'Origin-chain settlement is not implemented in the scaffold.',
            transaction: '',
            network: request.paymentRequirements.network,
          }
        }
        return result as SettleResponse
      }
    }
  } catch (err) {
    return {
      success: false,
      errorReason: 'unexpected_error',
      errorMessage: err instanceof Error ? err.message : String(err),
      transaction: '',
      network: request.paymentRequirements.network,
    }
  }
  return {
    success: false,
    errorReason: 'not_implemented',
    errorMessage: 'Origin-chain settlement is not implemented in the scaffold.',
    transaction: '',
    network: request.paymentRequirements.network,
  }
}
