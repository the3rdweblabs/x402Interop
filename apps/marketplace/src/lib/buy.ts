// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { addressNetworkError } from '@x402interop/core'

import type { Resource } from './marketplace.js'

/** Families whose Intents asset id can be resolved from a `usdc` symbol today. */
const QUOTABLE_FAMILIES = new Set(['eip155', 'sui', 'solana'])

/**
 * Quote link for a listing.
 *
 * The seller address comes from `payTo`, never from `owner`: an owner is a
 * CAIP-10 identity (`eip155:8453:0x…`) and is not a valid payout address on any
 * chain. Listings without a `payTo` get no link, because there is nowhere to pay.
 *
 * The network is chosen from those where `payTo` is actually a valid address, so
 * a Solana payout address never produces an EVM quote link.
 */
export function quoteLinkFor(resource: Resource): string | undefined {
  const payTo = resource.payTo
  if (!payTo) return undefined
  if (resource.asset !== 'usdc') return undefined
  const network = resource.networks.find(
    (item) =>
      QUOTABLE_FAMILIES.has(item.split(':')[0] ?? '') &&
      addressNetworkError(item, payTo) === undefined,
  )
  if (!network) return undefined
  const [whole = '', fraction = ''] = resource.price.split('.')
  if (!/^\d+$/.test(whole) || !/^\d{0,6}$/.test(fraction)) return undefined
  const atomic = (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString()
  const params = new URLSearchParams({
    sellerNetwork: network,
    sellerAsset: 'usdc',
    sellerAddress: payTo,
    amount: atomic,
  })
  return `/quote?${params.toString()}`
}
