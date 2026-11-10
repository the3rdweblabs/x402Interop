// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * The interop binding is common to every family: a `quoteId`, a single-use
 * `depositAddress`, a `nonce`, and an `expiresAt`. The origin-chain proof on
 * top of it differs per family. This module owns the shared half so each
 * adapter only supplies the proof check.
 *
 * Return convention: `undefined` means "the binding checks out, continue".
 * A `VerifyResponse` means "stop, this is the verdict".
 */

import type { Network, PaymentPayload, VerifyResponse } from '@x402interop/core'
import { asQuote, isQuoteValid, type InteropQuoteStore } from './store.js'

export interface InteropBinding {
  quoteId?: string
  depositAddress?: string
  nonce?: string
  expiresAt?: string
  [key: string]: unknown
}

export function interopBindingOf(payload: PaymentPayload): InteropBinding | undefined {
  const body = (payload.payload ?? {}) as Record<string, any>
  return body.binding ?? body.authorization?.binding
}

/**
 * Checks that need no network and no chain client: the binding exists, the
 * quote is known and unexpired, the deposit address matches, and the nonce
 * has not been spent.
 *
 * The quote checks only apply when a store is wired. Without one an adapter
 * cannot tell a replayed nonce from a fresh one, so callers must treat that
 * as a configuration error rather than silently accepting payments.
 */
export async function checkInteropBinding(
  payload: PaymentPayload,
  store: InteropQuoteStore | undefined,
): Promise<VerifyResponse | undefined> {
  const binding = interopBindingOf(payload)
  if (!binding) {
    return { isValid: false, invalidReason: 'missing_binding' }
  }
  // Field completeness is a family concern: EVM reports a binding-only payload
  // as `not_implemented` (the settlement layer adjudicates it), while a
  // malformed one is `invalid_binding`. Checking it here would collapse the
  // two into one answer.
  if (!store) return undefined

  // A quote this store has never seen is not expired. Another facilitator, or
  // the settlement layer, may still be the authority for it.
  const quote = binding.quoteId ? asQuote(await store.getQuote(binding.quoteId)) : undefined
  if (quote && !isQuoteValid(quote)) {
    return { isValid: false, invalidReason: 'quote_expired' }
  }
  if (
    quote?.depositAddress &&
    binding.depositAddress &&
    quote.depositAddress !== binding.depositAddress
  ) {
    return {
      isValid: false,
      invalidReason: 'amount_mismatch',
      invalidMessage: 'depositAddress does not match the quoted address',
    }
  }
  if (binding.nonce && (await store.hasNonce(binding.nonce))) {
    return { isValid: false, invalidReason: 'nonce_reused' }
  }
  return undefined
}

/**
 * The proof an adapter could not check. Reporting `not_implemented` rather
 * than a generic failure keeps "we cannot verify this" distinct from "this
 * payment is invalid" - the two need different fixes.
 */
export function notImplemented(family: string, detail?: string): VerifyResponse {
  return {
    isValid: false,
    invalidReason: 'not_implemented',
    invalidMessage: detail ?? `Origin-chain verification is not configured for ${family}`,
  }
}

/**
 * A settlement that failed. `transaction` is deliberately empty: no chain
 * transaction exists, and inventing an id would let a caller record a
 * dispatch that never happened.
 */
export function unsettled(
  network: Network,
  reason: string,
  message?: string,
): {
  success: false
  errorReason: string
  errorMessage?: string
  transaction: ''
  network: Network
} {
  return {
    success: false,
    errorReason: reason,
    ...(message ? { errorMessage: message } : {}),
    transaction: '',
    network,
  }
}
