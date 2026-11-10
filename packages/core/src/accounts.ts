// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { Network } from '@x402/core/types'

import { familyForNetwork, normalizeNetwork } from './networks.js'
import type { ChainFamily } from './schemes.js'

/**
 * Account addressing shared by the facilitator and the marketplace.
 *
 * Two distinct values are needed for a listing and they must not be confused:
 *
 * - `owner` - who registered and controls the listing. A CAIP-10 account id
 *   (`<namespace>:<reference>:<address>`). It is an identity, never a payout
 *   destination.
 * - `payTo` - where the seller is paid. A bare address that must be valid for
 *   the network it settles on.
 *
 * Storing an `owner` id in `payTo` (or sending an `owner` id to a settlement
 * layer as a recipient) is the bug this module exists to prevent.
 */

/** CAIP-10 account id: `<namespace>:<reference>:<address>` for the supported families. */
export interface Caip10Account {
  namespace: string
  reference: string
  address: string
}

const CAIP10_PATTERN = /^([a-z0-9-]+):([^:]+):(.+)$/

/** Chain families that carry a registered account address we can validate shapes for. */
const ADDRESS_PATTERNS: Readonly<Record<ChainFamily, RegExp | undefined>> = {
  evm: /^0x[0-9a-fA-F]{40}$/,
  sui: /^0x[0-9a-fA-F]{64}$/,
  svm: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  near: /^([a-z0-9._-]{2,64}\.near|ed25519:[1-9A-HJ-NP-Za-km-z]{32,44})$/,
  aptos: /^0x[0-9a-fA-F]{1,64}$/,
  starknet: /^0x[0-9a-fA-F]{1,64}$/,
  ton: /^(EQ|UQ|0:)[0-9A-Za-z_-]{46,48}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  xrpl: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/,
  stellar: /^G[A-Z2-7]{55}$/,
  lightning: undefined,
  utxo: undefined,
}

/** Human-readable address shape per family, used in validation messages. */
const ADDRESS_HINTS: Readonly<Record<ChainFamily, string>> = {
  evm: 'a 0x-prefixed 40-character hex address',
  sui: 'a 0x-prefixed 64-character hex address',
  svm: 'a base58 Solana address',
  near: 'a .near account id or an ed25519:<base58 key> public key',
  aptos: 'a 0x-prefixed hex address',
  starknet: 'a 0x-prefixed hex address',
  ton: 'a TON EQ…/UQ… address',
  tron: 'a base58 address starting with T',
  xrpl: 'an XRP Ledger address starting with r',
  stellar: 'a Stellar G… address',
  lightning: 'an address this family cannot validate',
  utxo: 'an address this family cannot validate',
}

/** True when the family has a checksum-independent shape check available. */
export function canValidateAddressForFamily(family: ChainFamily): boolean {
  return ADDRESS_PATTERNS[family] !== undefined
}

/** Returns the family a network settles on, if the namespace is known. */
export function familyOfNetwork(network: Network | string): ChainFamily | undefined {
  return familyForNetwork(normalizeNetwork(network) as Network)
}

/**
 * Returns an error message when `address` is not a plausible address on
 * `network`, or `undefined` when it is (or when the family has no check).
 */
export function addressNetworkError(
  network: Network | string,
  address: string,
): string | undefined {
  const family = familyOfNetwork(network)
  if (!family) return `Unknown network "${network}"`
  const pattern = ADDRESS_PATTERNS[family]
  if (!pattern) return undefined
  if (pattern.test(address)) return undefined
  return `${normalizeNetwork(String(network))} needs ${ADDRESS_HINTS[family]}`
}

/**
 * Parses a CAIP-10 account id. Returns `undefined` for a bare address, a
 * legacy `evm:0x…` two-part id, or anything else that is not three parts.
 */
export function parseCaip10(value: string): Caip10Account | undefined {
  const match = CAIP10_PATTERN.exec(value)
  if (!match) return undefined
  const [, namespace, reference, address] = match
  if (!namespace || !reference || !address) return undefined
  return { namespace, reference, address }
}

/** Builds a CAIP-10 id from a CAIP-2 network and a bare address. */
export function toCaip10(network: Network | string, address: string): string {
  const canonical = normalizeNetwork(String(network))
  const separator = canonical.indexOf(':')
  if (separator === -1) throw new Error(`"${network}" is not a CAIP-2 network id`)
  return `${canonical}:${address}`
}

/**
 * True when `value` is a well-formed CAIP-10 account for a known family and the
 * embedded address matches that network's shape.
 */
export function isCaip10AccountForNetwork(value: string, network: Network | string): boolean {
  const account = parseCaip10(value)
  if (!account) return false
  const canonical = normalizeNetwork(String(network))
  const expected = canonical.slice(0, canonical.indexOf(':'))
  if (account.namespace !== expected) return false
  return addressNetworkError(canonical, account.address) === undefined
}

/** Shortens an address for display: `0x9307…6c2a`, keeping both ends readable. */
export function shortenAddress(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) return value
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}
