// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Registry that resolves who implements `exact` for a scheme+family pair,
 * straight from `manifest.ts`. Upstream families delegate to `@x402/*`;
 * spec-native families (sui, starknet, lightning) use the implementations
 * built from the mirrored official specs; interop-only families (tron, utxo)
 * resolve to nothing and must not be advertised as `exact`.
 */

import type { ChainFamily } from '@x402interop/core'

import type { UpstreamExact } from '../shared/upstream.js'
import { loadUpstreamExact } from '../shared/upstream.js'
import { entryForFamily } from './manifest.js'

export interface ExactFacilitator {
  readonly source: 'upstream' | 'spec-native'
  verify(payload: unknown, requirements: unknown): Promise<unknown>
  settle(payload: unknown, requirements: unknown): Promise<unknown>
}

const SPEC_NATIVE_LOADERS: Readonly<Partial<Record<ChainFamily, () => Promise<ExactFacilitator>>>> =
  {
    sui: async () => {
      const { verifyExact, settleExact } = await import('../sui/exact.js')
      return { source: 'spec-native', verify: verifyExact, settle: settleExact }
    },
    starknet: async () => {
      const { verifyExact, settleExact } = await import('../starknet/exact.js')
      return { source: 'spec-native', verify: verifyExact, settle: settleExact }
    },
    lightning: async () => {
      const { verifyExact, settleExact } = await import('../lightning/exact.js')
      return { source: 'spec-native', verify: verifyExact, settle: settleExact }
    },
  }

async function upstreamExact(moduleId: string): Promise<ExactFacilitator | null> {
  const upstream = await loadUpstreamExact(moduleId)
  if (!upstream) return null
  return {
    source: 'upstream',
    verify: (p, r) => (upstream as UpstreamExact).verify(p, r),
    settle: (p, r) => (upstream as UpstreamExact).settle(p, r),
  }
}

/**
 * Resolve the `exact` implementation for a family, or `null` when the family
 * is interop-only (no official spec, no upstream package).
 */
export async function resolveExactFacilitator(
  family: ChainFamily,
): Promise<ExactFacilitator | null> {
  const entry = entryForFamily(family)
  if (!entry) return null
  if (entry.exactSource === 'upstream' && entry.upstreamModule) {
    return upstreamExact(entry.upstreamModule)
  }
  if (entry.exactSource === 'spec-native') {
    const loader = SPEC_NATIVE_LOADERS[family]
    if (loader) return loader()
  }
  return null
}

/** True when a family can advertise `exact` at all. */
export function supportsExact(family: ChainFamily): boolean {
  const entry = entryForFamily(family)
  return entry?.exactSource !== undefined && entry.exactSource !== 'interop-only'
}
