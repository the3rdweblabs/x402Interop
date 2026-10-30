// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { X402_VERSION, type SupportedKind } from '@x402interop/core'
import { evmAdapter, EVM_NETWORKS } from '@x402interop/adpt/evm'
import { lightningAdapter, LIGHTNING_NETWORKS } from '@x402interop/adpt/lightning'
import { nearAdapter, NEAR_NETWORKS } from '@x402interop/adpt/near'
import { suiAdapter, SUI_NETWORKS } from '@x402interop/adpt/sui'
import { svmAdapter, SVM_NETWORKS } from '@x402interop/adpt/svm'
import { tonAdapter, TON_NETWORKS } from '@x402interop/adpt/ton'
import { tronAdapter, TRON_NETWORKS } from '@x402interop/adpt/tron'
import { xrplAdapter, XRPL_NETWORKS } from '@x402interop/adpt/xrpl'

const FAMILIES = [
  { adapter: evmAdapter, networks: EVM_NETWORKS || [] },
  { adapter: svmAdapter, networks: SVM_NETWORKS || [] },
  { adapter: suiAdapter, networks: SUI_NETWORKS || [] },
  { adapter: nearAdapter, networks: NEAR_NETWORKS || [] },
  { adapter: tonAdapter, networks: TON_NETWORKS || [] },
  { adapter: tronAdapter, networks: TRON_NETWORKS || [] },
  { adapter: xrplAdapter, networks: XRPL_NETWORKS || [] },
  { adapter: lightningAdapter, networks: LIGHTNING_NETWORKS || [] },
] as const

export function supportedKinds(): SupportedKind[] {
  const kinds: SupportedKind[] = []
  for (const family of FAMILIES) {
    const networks = Array.isArray(family.networks) ? family.networks : []
    for (const network of networks) {
      kinds.push({
        x402Version: X402_VERSION,
        scheme: (family.adapter as any).scheme || (family.adapter as any).schemes?.[0],
        network,
      })
    }
  }
  return kinds
}


export function getSupportedKinds(): SupportedKind[] {
  const kinds = supportedKinds()
  const interopSchemes = ['x402interop-evm', 'x402interop-svm', 'x402interop-sui', 'x402interop-near', 'x402interop-tvm', 'x402interop-tron', 'x402interop-xrpl', 'x402interop-lightning']
  const networks = ['eip155:8453', 'eip155:1', 'solana:mainnet', 'sui:mainnet', 'near:mainnet']
  for (const scheme of interopSchemes) {
    for (const network of networks) {
      kinds.push({ x402Version: X402_VERSION, scheme, network })
    }
  }
  return kinds
}
