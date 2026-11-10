// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Spec-native `exact` on Sui, built from
 * `docs/specs/schemes/exact/scheme_exact_sui.md` (mirrored upstream).
 *
 * The client signs a complete Sui transaction that moves `amount` of `asset`
 * to `payTo`. Local rules validate the requirement and payload shape; the
 * signature/balance checks are delegated to an injected `SuiExactClient`
 * (Sui RPC), and verification fails closed without one - the spec forbids
 * accepting a payment the facilitator could not check on-chain.
 */

import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'

export interface SuiExactClient {
  /** Simulate the signed transaction; must confirm an exact balance change. */
  simulateTransaction(transactionBase64: string, signature: string): Promise<void>
  /** Broadcast the transaction on settlement. */
  executeTransaction(transactionBase64: string, signature: string): Promise<{ digest: string }>
}

export interface SuiExactOptions {
  client?: SuiExactClient
}

const SUI_NETWORK_PREFIX = 'sui:'

function isBase10Integer(value: string): boolean {
  return /^\d+$/.test(value) && value !== '0'
}

function isHexAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value)
}

/** Small helper: true when the string looks base64 (RFC 4648). */
function looksBase64(value: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length > 0
}

/**
 * Run every locally-checkable rule from the spec. Returns the stable
 * `invalidReason` token or `null` when the payload is well-formed.
 */
export function checkSuiExactPayload(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): string | null {
  const accepted = payload.accepted
  if (payload.x402Version !== 2) return 'invalid_x402_version'
  if (accepted.scheme !== 'exact' || requirements.scheme !== 'exact') return 'invalid_scheme'
  if (!accepted.network.startsWith(SUI_NETWORK_PREFIX)) return 'invalid_network'
  if (accepted.network !== requirements.network) return 'network_mismatch'
  if (accepted.amount !== requirements.amount) return 'invalid_exact_sui_payload_amount_mismatch'
  if (accepted.asset !== requirements.asset) return 'invalid_exact_sui_payload_asset_mismatch'
  if (accepted.payTo !== requirements.payTo) return 'invalid_exact_sui_payload_recipient_mismatch'
  if (accepted.maxTimeoutSeconds !== requirements.maxTimeoutSeconds) {
    return 'invalid_exact_sui_payload_max_timeout_mismatch'
  }
  if (!isBase10Integer(requirements.amount)) return 'invalid_payment_requirements'
  if (!isHexAddress(requirements.payTo)) return 'invalid_exact_sui_payload_recipient_malformed'

  const body = payload.payload as { signature?: unknown; transaction?: unknown } | undefined
  if (!body) return 'invalid_payload'
  if (typeof body.signature !== 'string' || !looksBase64(body.signature)) return 'invalid_payload'
  if (typeof body.transaction !== 'string' || !looksBase64(body.transaction))
    return 'invalid_payload'
  return null
}

export async function verifyExact(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: SuiExactOptions = {},
): Promise<VerifyResponse> {
  const localReason = checkSuiExactPayload(payload, requirements)
  if (localReason) return { isValid: false, invalidReason: localReason }
  if (!options.client) {
    return {
      isValid: false,
      invalidReason: 'unexpected_verify_error',
      invalidMessage: 'no Sui RPC client configured; cannot verify the signed transaction',
    }
  }
  const body = payload.payload as { signature: string; transaction: string }
  try {
    await options.client.simulateTransaction(body.transaction, body.signature)
  } catch {
    // A simulation the node could not complete has no verdict.
    return { isValid: false, invalidReason: 'unexpected_verify_error' }
  }
  return { isValid: true }
}

export async function settleExact(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: SuiExactOptions = {},
): Promise<SettleResponse> {
  const verified = await verifyExact(payload, requirements, options)
  if (!verified.isValid) {
    return {
      success: false,
      errorReason: verified.invalidReason || 'verification_failed',
      errorMessage: verified.invalidMessage,
      transaction: '',
      network: requirements.network,
    }
  }
  if (!options.client) {
    return {
      success: false,
      errorReason: 'unexpected_settle_error',
      errorMessage: 'no Sui RPC client configured; cannot broadcast the transaction',
      transaction: '',
      network: requirements.network,
    }
  }
  try {
    const body = payload.payload as { signature: string; transaction: string }
    const result = await options.client.executeTransaction(body.transaction, body.signature)
    return { success: true, transaction: result.digest, network: requirements.network }
  } catch {
    return {
      success: false,
      errorReason: 'unexpected_settle_error',
      transaction: '',
      network: requirements.network,
    }
  }
}
