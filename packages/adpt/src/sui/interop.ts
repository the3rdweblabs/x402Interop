// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Interop (`x402interop-sui`) on Sui.
 *
 * The buyer signs a full Sui transaction that funds the quote's deposit
 * address and sends it along. Verification is therefore local: simulate the
 * signed transaction against a Sui node and, when the client exposes balance
 * deltas, require the deposit actually moved. Without a client the payment
 * cannot be checked, so it fails closed with `not_implemented` rather than
 * accepting an unverified transaction.
 */

import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'
import { SCHEME_IDS } from '@x402interop/core'
import type { InteropVerificationOptions } from '../shared/interop-verify.js'
import {
  originProofOf,
  settleInteropFamily,
  verifyInteropFamily,
} from '../shared/interop-verify.js'
import type { SuiExactClient } from './exact.js'

/**
 * A Sui node client for interop. Same two operations as the `exact` client,
 * but simulation is allowed to return the node's response so balance deltas
 * can be inspected. A plain `SuiExactClient` satisfies this: `Promise<void>`
 * is assignable where `Promise<unknown>` is expected.
 */
export interface SuiInteropClient {
  simulateTransaction(transactionBase64: string, signature: string): Promise<unknown>
  executeTransaction(transactionBase64: string, signature: string): Promise<{ digest: string }>
}

export interface SuiInteropOptions extends InteropVerificationOptions {
  /** Sui RPC client. Interop verification and settlement both require one. */
  client?: SuiInteropClient | SuiExactClient
}

/**
 * Reads the deposit amount a simulated transaction moved into `depositAddress`.
 * Returns `undefined` when the client cannot report balance changes, which
 * the caller treats as "unchecked" rather than "zero".
 */
function depositedTo(
  result: unknown,
  depositAddress: string,
): bigint | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const deltas = (result as { balanceChanges?: unknown }).balanceChanges
  if (!Array.isArray(deltas)) return undefined
  let total = 0n
  let seen = false
  for (const delta of deltas) {
    if (typeof delta !== 'object' || delta === null) continue
    const owner = (delta as { owner?: unknown }).owner
    const address =
      typeof owner === 'string'
        ? owner
        : typeof owner === 'object' && owner !== null
          ? (owner as { address?: unknown }).address
          : undefined
    if (
      typeof address !== 'string' ||
      address.toLowerCase() !== depositAddress.toLowerCase()
    ) {
      continue
    }
    const amount = (delta as { amount?: unknown }).amount
    if (typeof amount === 'string' && /^-?\d+$/.test(amount)) {
      const value = BigInt(amount)
      if (value > 0n) total += value
      seen = true
    } else if (typeof amount === 'number' && Number.isInteger(amount)) {
      if (amount > 0) total += BigInt(amount)
      seen = true
    }
  }
  return seen ? total : undefined
}

export async function verifyInterop(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: SuiInteropOptions = {},
): Promise<VerifyResponse> {
  return verifyInteropFamily('sui', SCHEME_IDS.sui, payload, requirements, {
    ...(options.store ? { store: options.store } : {}),
    proof: options.proof ?? (async ({ quote }) => {
      const proof = originProofOf(payload)
      const transaction = proof.transaction
      const signature = proof.signature
      if (typeof transaction !== 'string' || typeof signature !== 'string') {
        return {
          isValid: false,
          invalidReason: 'invalid_payload',
          invalidMessage: 'A Sui interop payment needs both a transaction and a signature',
        }
      }
      if (!options.client) {
        return {
          isValid: false,
          invalidReason: 'not_implemented',
          invalidMessage:
            'no Sui RPC client configured; cannot verify the signed interop transaction',
        }
      }
      let simulated: unknown
      try {
        simulated = await (options.client.simulateTransaction(transaction, signature) as Promise<
          unknown
        >)
      } catch {
        return {
          isValid: false,
          invalidReason: 'unexpected_verify_error',
          invalidMessage: 'The Sui node could not simulate the transaction',
        }
      }
      // When the node reports balance changes, the deposit must be met in
      // full. A simulation that succeeds but moves nothing is not payment.
      const depositAddress = quote?.depositAddress
      if (typeof depositAddress === 'string') {
        const moved = depositedTo(simulated, depositAddress)
        if (moved === undefined) return undefined
        const minimum = quote?.minAmountIn
        if (typeof minimum === 'string' && /^\d+$/.test(minimum)) {
          if (moved < BigInt(minimum)) {
            return {
              isValid: false,
              invalidReason: 'amount_mismatch',
              invalidMessage: 'The signed transaction does not fund the quoted deposit',
            }
          }
        } else if (moved <= 0n) {
          return {
            isValid: false,
            invalidReason: 'amount_mismatch',
            invalidMessage: 'The signed transaction moves no funds to the deposit address',
          }
        }
      }
      return undefined
    }),
  })
}

export async function settleInterop(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: SuiInteropOptions = {},
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
  const transaction = proof.transaction
  const signature = proof.signature
  if (typeof transaction !== 'string' || typeof signature !== 'string' || !options.client) {
    return {
      success: false,
      errorReason: 'not_implemented',
      errorMessage: 'A Sui RPC client is required to broadcast an interop settlement',
      transaction: '',
      network: requirements.network,
    }
  }
  try {
    const result = await options.client.executeTransaction(transaction, signature)
    return { success: true, transaction: result.digest, network: requirements.network }
  } catch {
    return {
      success: false,
      errorReason: 'unexpected_settle_error',
      errorMessage: 'The Sui node rejected the transaction',
      transaction: '',
      network: requirements.network,
    }
  }
}

export { settleInteropFamily }
