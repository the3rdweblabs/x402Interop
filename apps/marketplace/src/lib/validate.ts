// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Browser-side checks for values that end up in quotes and links. These are
 * UX guards, not a substitute for the facilitator's own validation.
 *
 * Address shape rules live in `@x402interop/core` so the browser and the
 * facilitator cannot disagree about what a valid payout address is.
 */

import { addressNetworkError } from '@x402interop/core'

const ATOMIC_AMOUNT = /^[1-9]\d*$/

/** True only for absolute http(s) URLs. Blocks `javascript:` and other schemes. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Returns an error message for an address that does not match its chain family. */
export function addressError(network: string, address: string): string | undefined {
  return addressNetworkError(network, address)
}

/** Returns an error message unless the amount is a positive integer in atomic units. */
export function atomicAmountError(amount: string): string | undefined {
  return ATOMIC_AMOUNT.test(amount) ? undefined : 'Amount must be a whole number of atomic units'
}
