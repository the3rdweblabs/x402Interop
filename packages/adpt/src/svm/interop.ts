// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Interop (`x402interop-svm`) on Solana.
 *
 * The buyer signs an origin transaction that funds the quote's deposit
 * address. Verification asks a Solana RPC node whether that transaction
 * exists, succeeded, and moved at least the quoted amount to the deposit
 * address. The node client is injected: `adpt` stays free of a specific RPC
 * implementation. Without one, verification fails closed.
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

/** What an SVM RPC node must answer for verification to have a verdict. */
export interface SvmInteropClient {
  /** Transaction status, or null when the node has never seen the signature. */
  getTransaction(
    signature: string,
  ): Promise<{
    err?: unknown
    /** Lamport/SPL transfers observed in the transaction, as `{ to, amount }`. */
    transfers?: Array<{ to?: string; amount?: string }>
  } | null>
}

export interface SvmInteropOptions extends InteropVerificationOptions {
  client?: SvmInteropClient
}

export async function verifyInterop(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: SvmInteropOptions = {},
): Promise<VerifyResponse> {
  return verifyInteropFamily('svm', SCHEME_IDS.svm, payload, requirements, {
    ...(options.store ? { store: options.store } : {}),
    proof: options.proof ?? (async ({ quote }) => {
      const proof = originProofOf(payload)
      const signature = proof.txHash ?? proof.signature
      if (typeof signature !== 'string' || signature.length === 0) {
        return {
          isValid: false,
          invalidReason: 'invalid_payload',
          invalidMessage: 'A Solana interop payment needs an origin transaction signature',
        }
      }
      if (!options.client) {
        return {
          isValid: false,
          invalidReason: 'not_implemented',
          invalidMessage: 'no Solana RPC client configured; cannot verify the origin transaction',
        }
      }
      let transaction: Awaited<ReturnType<SvmInteropClient['getTransaction']>>
      try {
        transaction = await options.client.getTransaction(signature)
      } catch {
        return {
          isValid: false,
          invalidReason: 'unexpected_verify_error',
          invalidMessage: 'The Solana RPC node could not read the transaction',
        }
      }
      if (!transaction) {
        return {
          isValid: false,
          invalidReason: 'payment_not_found',
          invalidMessage: 'The Solana RPC node has not seen this transaction',
        }
      }
      if (transaction.err) {
        return {
          isValid: false,
          invalidReason: 'payment_failed',
          invalidMessage: 'The origin transaction failed on chain',
        }
      }
      const depositAddress = quote?.depositAddress
      const transfers = transaction.transfers
      if (typeof depositAddress !== 'string' || !Array.isArray(transfers)) return undefined
      const moved = transfers
        .filter(
          (entry) =>
            typeof entry.to === 'string' &&
            entry.to.toLowerCase() === depositAddress.toLowerCase(),
        )
        .reduce(
          (total, entry) =>
            total +
            (typeof entry.amount === 'string' && /^\d+$/.test(entry.amount)
              ? BigInt(entry.amount)
              : 0n),
          0n,
        )
      const minimum = quote?.minAmountIn
      if (typeof minimum === 'string' && /^\d+$/.test(minimum)) {
        if (moved < BigInt(minimum)) {
          return {
            isValid: false,
            invalidReason: 'amount_mismatch',
            invalidMessage: 'The origin transaction does not fund the quoted deposit',
          }
        }
      } else if (moved <= 0n) {
        return {
          isValid: false,
          invalidReason: 'amount_mismatch',
          invalidMessage: 'The origin transaction moves no funds to the deposit address',
        }
      }
      return undefined
    }),
  })
}

/**
 * Settlement reports the confirmed origin signature. Solana has no second
 * broadcast to perform: the buyer already submitted the transfer, so success
 * is the verified signature, never a synthesised one.
 */
export async function settleInterop(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: SvmInteropOptions = {},
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
  const signature = proof.txHash ?? proof.signature
  if (typeof signature !== 'string' || signature.length === 0) {
    return {
      success: false,
      errorReason: 'invalid_payload',
      errorMessage: 'Settlement needs the origin transaction signature',
      transaction: '',
      network: requirements.network,
    }
  }
  return {
    success: true,
    transaction: signature,
    network: requirements.network,
    ...(verified.payer ? { payer: verified.payer } : {}),
  }
}
