// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * `@x402interop/servers` root: the framework-agnostic seller middleware plus
 * the accept-expansion helpers the framework subpaths (`./express`, `./hono`,
 * `./fastify`, `./next`) share. Interop entries stay vacant (`payTo: ''`) and
 * are minted per request through the injected quote minter, so this module
 * never imports `@x402interop/intents`.
 */

import { DEFAULT_SCHEMES, INTEROP_SCHEMES, resolveCapabilities } from '@x402interop/adpt'
import type { Network } from '@x402interop/core'

export * from './middleware.js'

export { DEFAULT_SCHEMES, INTEROP_SCHEMES, resolveCapabilities }
export type { Capabilities, CapabilityInput } from '@x402interop/adpt'
export { createInteropServer as createInteropSchemeServer } from '@x402interop/adpt'

/** Options for {@link interopAccept}: one entry per (scheme × network) pair. */
export interface InteropAcceptOptions {
  /** Human-readable price label, copied to every generated entry. */
  price: string
  /** `'all'` (default) or explicit scheme names. `'all'` = `DEFAULT_SCHEMES`. */
  schemes?: 'all' | string[]
  /** `'all'` (default, curated mainnet catalogue) or explicit network ids. */
  networks?: 'all' | string[]
  /** `payTo` copied to every entry; vacant (`''`) by default, filled per request. */
  payTo?: string
  maxTimeoutSeconds?: number
  /** Per-network (fallback: per-scheme) asset ids attached to generated entries. */
  assetOverrides?: Record<string, string>
}

/** One generated payment option, matching upstream `PaymentOption`'s core fields. */
export interface InteropAcceptEntry {
  scheme: string
  payTo: string
  price: string
  network: string
  maxTimeoutSeconds?: number
  asset?: string
}

/**
 * Expand an accept selection into a concrete, vacant matrix of payment
 * options. `'all'` runs through `resolveCapabilities` (curated `ALL_NETWORKS`
 * mainnet catalogue, default scheme set); explicit arrays are never widened.
 */
export function interopAccept(options: InteropAcceptOptions): InteropAcceptEntry[] {
  const caps = resolveCapabilities({
    schemes: options.schemes ?? 'all',
    networks:
      options.networks === 'all' || options.networks === undefined
        ? 'all'
        : (options.networks as Network[]),
  })
  const entries: InteropAcceptEntry[] = []
  for (const scheme of caps.schemes) {
    for (const network of caps.networks) {
      const entry: InteropAcceptEntry = {
        scheme,
        payTo: options.payTo ?? '',
        price: options.price,
        network,
      }
      if (options.maxTimeoutSeconds !== undefined) {
        entry.maxTimeoutSeconds = options.maxTimeoutSeconds
      }
      const asset = options.assetOverrides?.[network] ?? options.assetOverrides?.[scheme]
      if (asset !== undefined) entry.asset = asset
      entries.push(entry)
    }
  }
  return entries
}

/** Fallback powers for {@link expandRoutes}: the `interopAccept` options with
 * `price`/`payTo` optional so each `$` entry can keep its own. */
export type ExpandPowers = Omit<InteropAcceptOptions, 'price' | 'payTo'> & {
  /** Fallback price for `$` entries that do not carry their own. */
  price?: string
  /** Fallback payTo for `$` entries that do not carry their own. */
  payTo?: string
}

/**
 * A single route slot held loosely on purpose: we never invent upstream
 * `RouteConfig` shapes here, we only read `accepts` and pass everything else
 * through untouched.
 */
export type RouteSlot = Record<string, any>

/** The accept sugar `expandRoutes` reads; non-`$` entries are never touched. */
export interface RouteAcceptSugar {
  scheme: string
  network?: string
  price?: string
  payTo?: string
  maxTimeoutSeconds?: number
}

function schemesForToken(token: string): 'all' | string[] {
  switch (token) {
    case '$interop':
      return [...INTEROP_SCHEMES]
    case '$exact':
      return ['exact']
    case '$all':
      return 'all'
    default:
      return [token.slice(1)]
  }
}

function networksForSugar(entry: RouteAcceptSugar, powers: ExpandPowers): 'all' | string[] {
  const network = typeof entry.network === 'string' ? entry.network : undefined
  if (network === undefined || network === '' || network === 'all' || network === '$all') {
    return powers.networks ?? 'all'
  }
  return network.startsWith('$') ? [network.slice(1)] : [network]
}

/**
 * Route sugar for "all by default". Every accept entry whose `scheme` starts
 * with `$` (`$interop`, `$exact`, `$all`, or `$name`) is replaced with the
 * matrix from {@link interopAccept}, inheriting the entry's own
 * `price`/`payTo`/`maxTimeoutSeconds` (falling back to `powers`); any entry
 * without a `$` scheme passes through untouched. Expansion happens once, so
 * the hot path stays upstream's.
 */
export function expandRoutes(
  routes: Record<string, RouteSlot>,
  powers: ExpandPowers = {},
): Record<string, RouteSlot> {
  const expanded: Record<string, RouteSlot> = {}
  for (const [key, slot] of Object.entries(routes)) {
    if (slot === null || typeof slot !== 'object' || !Array.isArray(slot.accepts)) {
      expanded[key] = slot
      continue
    }
    const nextAccepts: unknown[] = []
    for (const entry of slot.accepts) {
      const sugar = entry as RouteAcceptSugar | null
      const scheme = typeof sugar?.scheme === 'string' ? sugar.scheme : ''
      if (!sugar || !scheme.startsWith('$')) {
        nextAccepts.push(entry)
        continue
      }
      const sugarScheme: string = scheme
      nextAccepts.push(
        ...interopAccept({
          price:
            typeof sugar.price === 'string' && sugar.price !== ''
              ? sugar.price
              : (powers.price ?? ''),
          payTo: typeof sugar.payTo === 'string' ? sugar.payTo : (powers.payTo ?? ''),
          schemes: schemesForToken(sugarScheme),
          networks: networksForSugar(sugar, powers),
          maxTimeoutSeconds:
            typeof sugar.maxTimeoutSeconds === 'number'
              ? sugar.maxTimeoutSeconds
              : powers.maxTimeoutSeconds,
          assetOverrides: powers.assetOverrides,
        }),
      )
    }
    expanded[key] = { ...slot, accepts: nextAccepts }
  }
  return expanded
}
