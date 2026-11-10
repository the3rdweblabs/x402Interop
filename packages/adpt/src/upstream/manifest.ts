// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * The one table that describes who implements which scheme for which family.
 * `adpt` is the only package allowed to know both upstream modules and
 * interop schemes; everything else resolves through this file.
 */

import type { ChainFamily } from '@x402interop/core'

export type ExactSource = 'upstream' | 'spec-native' | 'interop-only'

export interface SchemeFamilyEntry {
  family: ChainFamily
  scheme: string
  interopScheme: string
  /** How `exact` is implemented for this family. */
  exactSource: ExactSource
  /** Upstream package delegated to for `exact` (source === 'upstream'). */
  upstreamModule?: string
  /** CAIP-2 namespace of the family. */
  caipNamespace: string
  /** Additional upstream schemes this family can delegate (opt-in). */
  upstreamSchemes?: string[]
}

/**
 * Day-one delegation matrix. Sui, Starknet, and Lightning (`lnbtc`) have
 * official `exact` specs mirrored under `docs/specs/schemes/` but no upstream
 * package, so they are implemented spec-natively. TRON and the UTXO chains
 * have no official spec: interop-only, and no third-party package is used.
 */
export const SCHEME_MANIFEST: readonly SchemeFamilyEntry[] = [
  {
    family: 'evm',
    scheme: 'exact',
    interopScheme: 'x402interop-evm',
    exactSource: 'upstream',
    upstreamModule: '@x402/evm',
    caipNamespace: 'eip155',
    upstreamSchemes: ['upto', 'auth-capture', 'batch-settlement'],
  },
  {
    family: 'svm',
    scheme: 'exact',
    interopScheme: 'x402interop-svm',
    exactSource: 'upstream',
    upstreamModule: '@x402/svm',
    caipNamespace: 'solana',
    upstreamSchemes: ['upto', 'batch-settlement'],
  },
  {
    family: 'near',
    scheme: 'exact',
    interopScheme: 'x402interop-near',
    exactSource: 'upstream',
    upstreamModule: '@x402/near',
    caipNamespace: 'near',
  },
  {
    family: 'ton',
    scheme: 'exact',
    interopScheme: 'x402interop-tvm',
    exactSource: 'upstream',
    upstreamModule: '@x402/tvm',
    caipNamespace: 'tvm',
  },
  {
    family: 'xrpl',
    scheme: 'exact',
    interopScheme: 'x402interop-xrpl',
    exactSource: 'upstream',
    upstreamModule: '@x402/xrpl',
    caipNamespace: 'xrpl',
    upstreamSchemes: ['upto'],
  },
  {
    family: 'aptos',
    scheme: 'exact',
    interopScheme: 'x402interop-aptos',
    exactSource: 'upstream',
    upstreamModule: '@x402/aptos',
    caipNamespace: 'aptos',
  },
  {
    family: 'stellar',
    scheme: 'exact',
    interopScheme: 'x402interop-stellar',
    exactSource: 'upstream',
    upstreamModule: '@x402/stellar',
    caipNamespace: 'stellar',
  },
  {
    family: 'sui',
    scheme: 'exact',
    interopScheme: 'x402interop-sui',
    exactSource: 'spec-native',
    caipNamespace: 'sui',
  },
  {
    family: 'starknet',
    scheme: 'exact',
    interopScheme: 'x402interop-starknet',
    exactSource: 'spec-native',
    caipNamespace: 'starknet',
  },
  {
    family: 'lightning',
    scheme: 'exact',
    interopScheme: 'x402interop-lightning',
    exactSource: 'spec-native',
    caipNamespace: 'lnbtc',
  },
  {
    family: 'tron',
    scheme: 'exact',
    interopScheme: 'x402interop-tron',
    exactSource: 'interop-only',
    caipNamespace: 'tron',
  },
  {
    family: 'utxo',
    scheme: 'exact',
    interopScheme: 'x402interop-utxo',
    exactSource: 'interop-only',
    caipNamespace: 'bip122',
  },
]

/** Every interop scheme in default engagement order. */
export const INTEROP_SCHEMES: readonly string[] = SCHEME_MANIFEST.map(
  (entry) => entry.interopScheme,
)

/** Families whose `exact` is delegated to an upstream package. */
export const UPSTREAM_EXACT: Readonly<Partial<Record<ChainFamily, { module: string }>>> =
  Object.fromEntries(
    SCHEME_MANIFEST.filter((e) => e.exactSource === 'upstream').map((e) => [
      e.family,
      { module: e.upstreamModule as string },
    ]),
  )

/** Opt-in upstream schemes → families. */
export const UPSTREAM_OPTIONAL_SCHEMES: Readonly<Record<string, readonly ChainFamily[]>> = {
  upto: SCHEME_MANIFEST.filter((e) => e.upstreamSchemes?.includes('upto')).map((e) => e.family),
  'auth-capture': SCHEME_MANIFEST.filter((e) => e.upstreamSchemes?.includes('auth-capture')).map(
    (e) => e.family,
  ),
  'batch-settlement': SCHEME_MANIFEST.filter((e) =>
    e.upstreamSchemes?.includes('batch-settlement'),
  ).map((e) => e.family),
}

/** Default scheme set per the capabilities model. */
export const DEFAULT_SCHEMES: readonly string[] = ['exact', ...INTEROP_SCHEMES]

export function entryForFamily(family: ChainFamily): SchemeFamilyEntry | undefined {
  return SCHEME_MANIFEST.find((entry) => entry.family === family)
}

export function entryForInteropScheme(scheme: string): SchemeFamilyEntry | undefined {
  return SCHEME_MANIFEST.find((entry) => entry.interopScheme === scheme)
}

export function exactSourceFor(scheme: string, family: ChainFamily): ExactSource | undefined {
  if (scheme !== 'exact') return undefined
  return entryForFamily(family)?.exactSource
}
