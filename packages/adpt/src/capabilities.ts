// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]
/**
 * Capabilities model: "all by default". Users never pick networks unless they
 * want to; `'all'` expands to the default scheme set (exact + every interop
 * scheme) on the curated mainnet `NETWORK_CATALOGUE`, minus explicit
 * exclusions. Explicit arrays are never widened.
 */

import {
  ALL_NETWORKS,
  NETWORK_CATALOGUE,
  networksForFamily,
  type ChainFamily,
  type Network,
} from '@x402interop/core'

import { DEFAULT_SCHEMES } from './upstream/manifest.js'

export interface CapabilityInput {
  schemes?: 'all' | string[]
  networks?: 'all' | Network[]
  excludeSchemes?: string[]
  excludeNetworks?: Network[]
  /** Replace the curated catalogue for the named families. */
  familyNetworks?: Partial<Record<ChainFamily, Network[]>>
}

export interface Capabilities {
  schemes: string[]
  networks: Network[]
  /** Scheme requests the configuration named but had to drop. */
  dropped?: { scheme?: string[]; network?: Network[] }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

export function resolveCapabilities(input: CapabilityInput = {}): Capabilities {
  const schemes =
    input.schemes === 'all' || input.schemes === undefined
      ? [...DEFAULT_SCHEMES]
      : [...input.schemes]

  const overrideFamilies = input.familyNetworks
    ? (Object.keys(input.familyNetworks) as ChainFamily[])
    : []

  let networks: Network[]
  if (input.networks === 'all' || input.networks === undefined) {
    if (overrideFamilies.length === 0) {
      networks = [...ALL_NETWORKS]
    } else {
      // Rebuild the catalogue with per-family overrides applied.
      const rebuilt: Network[] = []
      for (const family of Object.keys(NETWORK_CATALOGUE) as ChainFamily[]) {
        const override = input.familyNetworks?.[family]
        rebuilt.push(...(override ?? [...networksForFamily(family)]))
      }
      networks = rebuilt
    }
  } else {
    networks = [...input.networks]
  }

  const excludedSchemes = new Set(input.excludeSchemes ?? [])
  const excludedNetworks = new Set(input.excludeNetworks ?? [])

  const finalSchemes = schemes.filter((scheme) => !excludedSchemes.has(scheme))
  const finalNetworks = networks.filter((network) => !excludedNetworks.has(network))

  return {
    schemes: unique(finalSchemes),
    networks: unique(finalNetworks),
    dropped: {
      scheme: schemes.filter((scheme) => excludedSchemes.has(scheme)),
      network: networks.filter((network) => excludedNetworks.has(network)),
    },
  }
}
