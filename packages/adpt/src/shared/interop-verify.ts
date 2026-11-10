// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Interop verification, family by family.
 *
 * Every interop payment carries two things: a *binding* to a facilitator
 * quote (shared shape, checked in `interop-binding.ts`) and an *origin proof*
 * - evidence that the buyer actually paid on its own chain. The proof is what
 * differs per family.
 *
 * Families split into two groups:
 *
 * - `svm`, `sui`, `near`, `evm`: the buyer hands over a signed origin-chain
 *   transaction, so the proof is checkable locally against a node client.
 * - everything else: the only evidence is the origin `txHash`, and the
 *   settlement layer is the sole authority on whether that transaction
 *   delivered. Those families must be verified through the facilitator's
 *   1Click status lookup, never by inventing a local verdict.
 */

import {
  SCHEME_IDS,
  type SettleResponse,
  type PaymentPayload,
  type PaymentRequirements,
  type VerifyResponse,
} from '@x402interop/core'
import { asQuote, type InteropQuoteStore, type InteropQuote } from './store.js'
import {
  checkInteropBinding,
  interopBindingOf,
  notImplemented,
  unsettled,
} from './interop-binding.js'

/**
 * Checks the origin-chain proof. Returns `undefined` to mean "the proof is
 * sound"; a verdict means it is not, or that it cannot be checked here.
 */
export type OriginProofCheck = (
  context: ProofContext,
) => Promise<VerifyResponse | undefined> | VerifyResponse | undefined

export interface ProofContext {
  payload: PaymentPayload
  requirements: PaymentRequirements
  quote: InteropQuote | undefined
}

export interface InteropVerificationOptions {
  /**
   * Quote and nonce state. Without it an adapter cannot detect a replayed
   * nonce, so interop verification fails closed.
   */
  store?: InteropQuoteStore
  /** Per-family origin-proof checker. Overrides the built-in one. */
  proof?: OriginProofCheck
}

/** Shape of the origin proof, flattened: it may sit at the top level or under `authorization`. */
export interface OriginProof {
  txHash?: string
  signature?: string
  /** Family-specific signed transaction blob (Sui transaction, SVM base64, NEAR signed tx). */
  transaction?: string
  from?: string
  originNetwork?: string
  originAsset?: string
  originAmount?: string
  [key: string]: unknown
}

export function originProofOf(payload: PaymentPayload): OriginProof {
  const body = (payload.payload ?? {}) as Record<string, any>
  return (body.authorization ?? body) as OriginProof
}

/**
 * A proof is present when the payload carries enough to identify the origin
 * transaction. A payload with no proof at all is a client bug, not a bad
 * payment, and is reported separately.
 */
export function hasOriginProof(proof: OriginProof): boolean {
  return Boolean(proof.txHash || proof.signature || proof.transaction)
}

/**
 * The default proof check: the proof must name the origin transaction and
 * carry an `originAmount` that meets the quote's minimum. Amount and asset
 * matching is the only part that can be checked without a chain client, so
 * it is the only part checked here.
 */
export function defaultProofCheck(
  family: string,
  context: ProofContext,
): VerifyResponse | undefined {
  const proof = originProofOf(context.payload)
  if (!hasOriginProof(proof)) {
    return notImplemented(family, `${family} interop payment carries no origin proof`)
  }
  const minimum = context.quote?.minAmountIn
  if (typeof minimum === 'string' && /^\d+$/.test(minimum)) {
    const paid = proof.originAmount
    if (typeof paid !== 'string' || !/^\d+$/.test(paid)) {
      return {
        isValid: false,
        invalidReason: 'invalid_binding',
        invalidMessage: 'The origin proof must state the amount paid (originAmount)',
      }
    }
    if (BigInt(paid) < BigInt(minimum)) {
      return {
        isValid: false,
        invalidReason: 'amount_mismatch',
        invalidMessage: 'The origin amount is below the quoted minimum',
      }
    }
  }
  return undefined
}

/**
 * Verification for one interop family. Shared by every adapter: the family
 * supplies only scheme wiring and, when it has one, a stronger proof check.
 */
export async function verifyInteropFamily(
  family: 'svm' | 'sui' | 'near' | 'evm' | 'other',
  scheme: string,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: InteropVerificationOptions = {},
): Promise<VerifyResponse> {
  if (payload.accepted.scheme !== scheme || requirements.scheme !== scheme) {
    return { isValid: false, invalidReason: 'scheme_mismatch' }
  }

  const bindingVerdict = await checkInteropBinding(payload, options.store)
  if (bindingVerdict) return bindingVerdict

  const binding = interopBindingOf(payload)
  const quote =
    options.store && binding?.quoteId
      ? asQuote(await options.store.getQuote(binding.quoteId))
      : undefined

  const check = options.proof ?? ((context) => defaultProofCheck(family, context))
  const proofVerdict = await check({ payload, requirements, quote })
  if (proofVerdict) {
    if (!proofVerdict.isValid) return proofVerdict
    // A proof that verified may add facts (the origin txHash, swap status).
    // They are merged so settlement can report a real receipt rather than
    // re-deriving it.
    return {
      isValid: true,
      ...(proofVerdict.payer ? { payer: proofVerdict.payer } : {}),
      extra: {
        quoteId: binding?.quoteId,
        depositAddress: binding?.depositAddress,
        ...(proofVerdict.extra ?? {}),
      },
    }
  }

  if (family === 'other') {
    // No local node client can adjudicate these families. The facilitator's
    // settlement-status lookup is the only authority, so a bare adapter call
    // reports that it cannot decide rather than guessing.
    return notImplemented(
      family,
      'This family is verified by the settlement layer, not by a local adapter',
    )
  }

  const payer =
    typeof originProofOf(payload).from === 'string'
      ? (originProofOf(payload).from as string)
      : undefined
  return {
    isValid: true,
    ...(payer ? { payer } : {}),
    extra: {
      quoteId: binding?.quoteId,
      depositAddress: binding?.depositAddress,
      originTxHash: originProofOf(payload).txHash,
    },
  }
}

/**
 * Settlement for one interop family. A settlement only succeeds when
 * verification did *and* a real origin transaction exists to report. The
 * returned `transaction` is always a hash the caller can look up; inventing
 * one is what this whole change removes.
 */
export async function settleInteropFamily(
  family: 'svm' | 'sui' | 'near' | 'evm' | 'other',
  scheme: string,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: InteropVerificationOptions = {},
): Promise<SettleResponse> {
  const verified = await verifyInteropFamily(family, scheme, payload, requirements, options)
  if (!verified.isValid) {
    return unsettled(
      requirements.network,
      verified.invalidReason ?? 'verification_failed',
      verified.invalidMessage,
    )
  }

  const proof = originProofOf(payload)
  const transaction = proof.txHash ?? proof.signature
  if (typeof transaction !== 'string' || transaction.length === 0) {
    return unsettled(
      requirements.network,
      'invalid_payload',
      'Settlement needs the origin transaction id',
    )
  }
  return {
    success: true,
    transaction,
    network: requirements.network,
    ...(verified.payer ? { payer: verified.payer } : {}),
  }
}

export { SCHEME_IDS }
