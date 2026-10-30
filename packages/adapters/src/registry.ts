// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { FamilyAdapter } from './types.js'
import { evmAdapter } from './evm/index.js'
import { svmAdapter } from './svm/index.js'
import { suiAdapter } from './sui/index.js'
import { nearAdapter } from './near/index.js'
import { tonAdapter } from './ton/index.js'
import { tronAdapter } from './tron/index.js'
import { xrplAdapter } from './xrpl/index.js'
import { lightningAdapter } from './lightning/index.js'

const adapters: FamilyAdapter[] = [
  evmAdapter,
  svmAdapter,
  suiAdapter,
  nearAdapter,
  tonAdapter,
  tronAdapter,
  xrplAdapter,
  lightningAdapter,
]

export function getAllAdapters(): FamilyAdapter[] {
  return adapters
}

export function getAdapter(input: string | { scheme?: string; network?: string }): FamilyAdapter | undefined {
  if (typeof input === 'string') {
    // Try to find by network
    for (const adapter of adapters) {
      if (adapter.networks?.includes(input)) return adapter
    }
    // Try by scheme
    for (const adapter of adapters) {
      if (adapter.scheme === input || adapter.schemes?.includes(input)) return adapter
    }
    return undefined
  }
  // Try by scheme first
  if (input.scheme) {
    for (const adapter of adapters) {
      if (adapter.scheme === input.scheme || adapter.schemes?.includes(input.scheme)) return adapter
    }
  }
  // Try by network
  if (input.network) {
    for (const adapter of adapters) {
      if (adapter.networks?.includes(input.network)) return adapter
    }
  }
  return undefined
}

export function isSupported(schemeOrNetwork: string): boolean {
  return getAdapter(schemeOrNetwork) !== undefined
}

export function supportedNetworks(): string[] {
  const nets = new Set<string>()
  for (const adapter of adapters) {
    for (const n of adapter.networks || []) nets.add(n)
  }
  return Array.from(nets)
}

export function supportedSchemes(): string[] {
  const schemes = new Set<string>()
  for (const adapter of adapters) {
    if (adapter.schemes) for (const s of adapter.schemes) schemes.add(s)
    if (adapter.scheme) schemes.add(adapter.scheme)
  }
  return Array.from(schemes)
}

import type { PaymentPayload, type PaymentRequirements } from '@x402interop/core'

export async function verify(payload: PaymentPayload, requirements: PaymentRequirements) {
  const adapter = getAdapter({ scheme: requirements.scheme || payload.accepted?.scheme, network: requirements.network })
  if (!adapter) {
    return { isValid: false, invalidReason: 'unsupported_scheme' }
  }
  return adapter.verify(payload, requirements)
}

export async function settle(payload: PaymentPayload, requirements: PaymentRequirements) {
  const adapter = getAdapter({ scheme: requirements.scheme || payload.accepted?.scheme, network: requirements.network })
  if (!adapter) {
    return { success: false, errorReason: 'unsupported_scheme', errorMessage: 'No adapter found', transaction: '', network: requirements.network }
  }
  return adapter.settle(payload, requirements)
}
