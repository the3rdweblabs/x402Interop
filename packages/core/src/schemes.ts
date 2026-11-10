// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Scheme ids are named for the buyer's chain family. TON's id is `tvm`,
 * following the CAIP-2 namespace, while the family key stays `ton`.
 *
 * `exact` and the other upstream schemes are never defined here: they belong
 * to `@x402/*` or to a spec-native implementation in `@x402interop/adpt`.
 */
export const SCHEME_IDS = {
  evm: 'x402interop-evm',
  svm: 'x402interop-svm',
  sui: 'x402interop-sui',
  near: 'x402interop-near',
  ton: 'x402interop-tvm',
  tron: 'x402interop-tron',
  xrpl: 'x402interop-xrpl',
  aptos: 'x402interop-aptos',
  stellar: 'x402interop-stellar',
  starknet: 'x402interop-starknet',
  lightning: 'x402interop-lightning',
  utxo: 'x402interop-utxo',
} as const

export type ChainFamily = keyof typeof SCHEME_IDS
export type SchemeId = (typeof SCHEME_IDS)[ChainFamily]

const SCHEME_ID_LIST = Object.values(SCHEME_IDS)

export function isInteropScheme(scheme: string): scheme is SchemeId {
  return (SCHEME_ID_LIST as readonly string[]).includes(scheme)
}

export function familyForScheme(scheme: string): ChainFamily | undefined {
  const families = Object.keys(SCHEME_IDS) as ChainFamily[]
  return families.find((family) => SCHEME_IDS[family] === scheme)
}

/**
 * Origin-chain binding inside an x402interop payload. It pins the signature
 * to one quote, one deposit address, one nonce, and an expiry. The facilitator
 * rejects a payload whose binding does not match the requirements it signed.
 */
export interface X402InteropBinding {
  quoteId: string
  depositAddress: string
  nonce: string
  expiresAt: string
}

/** Alias kept for callers that imported the shorter name. */
export type InteropBinding = X402InteropBinding

/** Scheme-specific payload: a family authorisation plus the binding above. */
export interface X402InteropSchemePayload {
  authorization: Record<string, unknown>
  binding: X402InteropBinding
}

/** Alias kept for callers that imported the shorter name. */
export type InteropSchemePayload = X402InteropSchemePayload

export const SCHEME_SUMMARIES: Record<ChainFamily, string> = {
  evm: 'EVM token authorisation (EIP-3009 where supported) paid to a single-use deposit address',
  svm: 'Partially signed Solana transfer to a single-use deposit address',
  sui: 'Signed Sui transaction transferring a coin to a single-use deposit address',
  near: 'NEP-366 delegated NEP-141 transfer to a single-use deposit address',
  ton: 'TON Jetton transfer to a single-use deposit address',
  tron: 'TRC-20 transfer to a single-use deposit address',
  xrpl: 'XRPL payment to a single-use deposit address',
  aptos: 'Aptos fungible-asset transfer to a single-use deposit address',
  stellar: 'Stellar payment or SAC transfer to a single-use deposit address',
  starknet: 'SNIP-9 outside execution transferring a SNIP-2 token to a single-use deposit address',
  lightning: 'BOLT11 payment to a single-use deposit address',
  utxo: 'Bitcoin-family transaction to a single-use deposit address',
}

export function summaryForScheme(scheme: string): string | undefined {
  const family = familyForScheme(scheme)
  return family ? SCHEME_SUMMARIES[family] : undefined
}

export function bindingMatchesQuote(
  binding: X402InteropBinding,
  quote: { quoteId: string; depositAddress: string; expiresAt: string },
): boolean {
  if (binding.quoteId !== quote.quoteId) return false
  if (binding.depositAddress !== quote.depositAddress) return false
  if (binding.expiresAt > quote.expiresAt) return false
  return binding.nonce.length > 0
}
