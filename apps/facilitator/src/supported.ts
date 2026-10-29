// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS
// [native]

import { X402_VERSION, type SupportedKind } from '@x402interop/core'
import { EVM_NETWORKS, evmAdapter } from '@x402interop/evm'
import { LIGHTNING_NETWORKS, lightningAdapter } from '@x402interop/lightning'
import { NEAR_NETWORKS, nearAdapter } from '@x402interop/near'
import { SUI_NETWORKS, suiAdapter } from '@x402interop/sui'
import { SVM_NETWORKS, svmAdapter } from '@x402interop/svm'
import { TON_NETWORKS, tonAdapter } from '@x402interop/ton'
import { TRON_NETWORKS, tronAdapter } from '@x402interop/tron'
import { XRPL_NETWORKS, xrplAdapter } from '@x402interop/xrpl'

const FAMILIES = [
  { adapter: evmAdapter, networks: EVM_NETWORKS },
  { adapter: svmAdapter, networks: SVM_NETWORKS },
  { adapter: suiAdapter, networks: SUI_NETWORKS },
  { adapter: nearAdapter, networks: NEAR_NETWORKS },
  { adapter: tonAdapter, networks: TON_NETWORKS },
  { adapter: tronAdapter, networks: TRON_NETWORKS },
  { adapter: xrplAdapter, networks: XRPL_NETWORKS },
  { adapter: lightningAdapter, networks: LIGHTNING_NETWORKS },
] as const

/** Kinds the scaffold claims. Same-chain pass-through is not registered yet. */
export function supportedKinds(): SupportedKind[] {
  const kinds: SupportedKind[] = []
  for (const family of FAMILIES) {
    for (const network of family.networks) {
      kinds.push({
        x402Version: X402_VERSION,
        scheme: family.adapter.scheme,
        network,
      })
    }
  }
  return kinds
}

export function getSupportedKinds(): SupportedKind[] {
  const kinds = supportedKinds()
  // Add x402interop schemes for all networks
  const interopSchemes = ['x402interop-evm', 'x402interop-svm', 'x402interop-sui', 'x402interop-near', 'x402interop-tvm', 'x402interop-tron', 'x402interop-xrpl', 'x402interop-lightning']
  const networks = ['eip155:8453', 'eip155:1', 'solana:mainnet', 'sui:mainnet', 'near:mainnet']
  for (const scheme of interopSchemes) {
    for (const network of networks) {
      kinds.push({ x402Version: X402_VERSION, scheme, network })
    }
  }
  return kinds
}
