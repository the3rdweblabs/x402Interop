// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import {
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

const paymentPayloadSchema = z.looseObject({
  x402Version: z.number(),
  accepted: paymentRequirementsSchema,
  payload: z.record(z.string(), z.unknown()),
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

/**
 * Structural checks only. A matching, unexpired payload still returns
 * `not_implemented` because signature verification is not built yet.
 */
export function verifyPayment(request: VerifyRequest, now: Date = new Date()): VerifyResponse {
  if (request.x402Version !== X402_VERSION) {
    return { isValid: false, invalidReason: 'unsupported_version' }
  }
  if (request.paymentPayload.accepted.scheme !== request.paymentRequirements.scheme) {
    return { isValid: false, invalidReason: 'scheme_mismatch' }
  }
  const expiresAt = request.paymentRequirements.extra?.expiresAt
  if (typeof expiresAt === 'string') {
    const expiry = Date.parse(expiresAt)
    if (Number.isFinite(expiry) && expiry <= now.getTime()) {
      return { isValid: false, invalidReason: 'quote_expired' }
    }
  }
  return {
    isValid: false,
    invalidReason: 'not_implemented',
    invalidMessage: 'Signature checks are not implemented in the scaffold.',
  }
}

export function settlePayment(request: SettleRequest, now: Date = new Date()): SettleResponse {
  const verified = verifyPayment(request, now)
  if (verified.invalidReason !== 'not_implemented') {
    return {
      success: false,
      errorReason: verified.invalidReason,
      errorMessage: verified.invalidMessage,
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
