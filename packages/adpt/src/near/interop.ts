// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Interop (`x402interop-near`) on NEAR.
 *
 * The buyer signs a NEP-141 transfer to the quote's deposit address and the
 * signed transaction plus its hash travel in the payment. Verification asks a
 * NEAR RPC node whether that transaction is final and succeeded. A signed
 * transaction that has not been broadcast is not a payment, so the node is
 * the only source of a verdict here.
 */

import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'
import { SCHEME_IDS } from '@x402interop/core'
import type { InteropVerificationOptions } from '../shared/interop-verify.js'
import { originProofOf, verifyInteropFamily } from '../shared/interop-verify.js'

/** What a NEAR RPC node must answer for verification to have a verdict. */
export interface NearInteropClient {
  /**
   * Outcome of an observed transaction, or null when the node has never seen
   * the hash. `success: false` with a failure message means it was rejected.
   */
  getTransactionOutcome(
    txHash: string,
    senderAccountId: string,
  ): Promise<{ success: boolean; failureMessage?: string } | null>
}

export interface NearInteropOptions extends InteropVerificationOptions {
  client?: NearInteropClient
}

/** NEAR account ids: 2-64 chars of `[a-z0-9._-]`, with no leading/trailing separator. */
function isNearAccountId(value: string): boolean {
  return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(value) && value.length >= 2
}

/** Base58 transaction hash, 32 bytes encoded. */
function isBase58Hash(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(value)
}

export async function verifyInterop(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: NearInteropOptions = {},
): Promise<VerifyResponse> {
  return verifyInteropFamily('near', SCHEME_IDS.near, payload, requirements, {
    ...(options.store ? { store: options.store } : {}),
    proof: options.proof ?? (async () => {
      const proof = originProofOf(payload)
      const txHash = proof.txHash
      if (typeof txHash !== 'string' || !isBase58Hash(txHash)) {
        return {
          isValid: false,
          invalidReason: 'invalid_payload',
          invalidMessage: 'A NEAR interop payment needs a base58 origin transaction hash',
        }
      }
      const sender = proof.from
      if (typeof sender !== 'string' || !isNearAccountId(sender)) {
        return {
          isValid: false,
          invalidReason: 'invalid_binding',
          invalidMessage: 'A NEAR interop payment needs the paying account (from)',
        }
      }
      if (!options.client) {
        return {
          isValid: false,
          invalidReason: 'not_implemented',
          invalidMessage: 'no NEAR RPC client configured; cannot verify the origin transaction',
        }
      }
      let outcome: Awaited<ReturnType<NearInteropClient['getTransactionOutcome']>>
      try {
        outcome = await options.client.getTransactionOutcome(txHash, sender)
      } catch {
        return {
          isValid: false,
          invalidReason: 'unexpected_verify_error',
          invalidMessage: 'The NEAR RPC node could not read the transaction',
        }
      }
      if (!outcome) {
        return {
          isValid: false,
          invalidReason: 'payment_not_found',
          invalidMessage: 'The NEAR RPC node has not seen this transaction',
        }
      }
      if (!outcome.success) {
        return {
          isValid: false,
          invalidReason: 'payment_failed',
          invalidMessage: outcome.failureMessage ?? 'The origin transaction failed on chain',
        }
      }
      return undefined
    }),
  })
}

/**
 * Settlement reports the final origin transaction hash. The buyer already
 * broadcast the transfer; there is nothing left to send, so success is the
 * verified hash and never a synthesised one.
 */
export async function settleInterop(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: NearInteropOptions = {},
): Promise<SettleResponse> {
  const verified = await verifyInterop(payload, requirements, options)
  if (!verified.isValid) {
    return {
      success: false,
      errorReason: verified.invalidReason ?? 'verification_failed',
      ...(verified.invalidMessage ? { errorMessage: verified.invalidMessage } : {}),
      transaction: '',
      network: requirements.network,
    }
  }
  const proof = originProofOf(payload)
  const txHash = proof.txHash
  if (typeof txHash !== 'string' || txHash.length === 0) {
    return {
      success: false,
      errorReason: 'invalid_payload',
      errorMessage: 'Settlement needs the origin transaction hash',
      transaction: '',
      network: requirements.network,
    }
  }
  return {
    success: true,
    transaction: txHash,
    network: requirements.network,
    ...(verified.payer ? { payer: verified.payer } : {}),
  }
}
