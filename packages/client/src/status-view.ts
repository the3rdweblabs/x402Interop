// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

/** Mirrors the status package without a dependency cycle through apps. */
export const SWAP_STATES = [
  'pending_deposit',
  'deposit_seen',
  'processing',
  'success',
  'refunded',
  'failed',
] as const

export type SwapState = (typeof SWAP_STATES)[number]
