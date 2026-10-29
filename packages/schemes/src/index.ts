// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { SCHEME_IDS, type ChainFamily, type SchemeId } from '@x402interop/core'

export { SCHEME_IDS, type ChainFamily, type SchemeId }

/**
 * Origin-chain binding inside an x402interop payload. It pins the signature
 * to one quote, one deposit address, one nonce, and an expiry.
 */
export interface InteropBinding {
  quoteId: string
  depositAddress: string
  nonce: string
  expiresAt: string
}

/** Scheme-specific payload: a family authorisation plus the binding above. */
export interface InteropSchemePayload {
  authorization: Record<string, unknown>
  binding: InteropBinding
}

export const SCHEME_SUMMARIES: Record<ChainFamily, string> = {
  evm: 'Token authorisation (EIP-3009 where the token supports it) paid to a single-use deposit address',
  svm: 'Partially signed transfer to a single-use deposit address',
  sui: 'Sui exact-scheme transfer to a single-use deposit address',
  near: 'NEP-366 delegated ft_transfer to a single-use deposit address',
  ton: 'TON scheme transfer to a single-use deposit address',
  tron: 'Tron transfer to a deposit address; the scheme is still open',
  xrpl: 'XRPL payment to a single-use deposit address',
  lightning: 'Lightning invoice preimage used as top-up credit',
}

export function summaryForScheme(scheme: string): string | undefined {
  const family = (Object.keys(SCHEME_IDS) as ChainFamily[]).find(
    (candidate) => SCHEME_IDS[candidate] === scheme,
  )
  if (!family) return undefined
  return SCHEME_SUMMARIES[family]
}

export function bindingMatchesQuote(
  binding: InteropBinding,
  quote: { quoteId: string; depositAddress: string; expiresAt: string },
): boolean {
  if (binding.quoteId !== quote.quoteId) return false
  if (binding.depositAddress !== quote.depositAddress) return false
  if (binding.expiresAt > quote.expiresAt) return false
  return binding.nonce.length > 0
}
