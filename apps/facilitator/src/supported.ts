// SPDX-License-Identifier: GPL-3.0-or-later
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
