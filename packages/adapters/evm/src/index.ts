// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createStubAdapter, SCHEME_IDS, type ChainAdapter } from '@x402interop/core'
import { isAddress } from 'viem'

/** Ethereum, Base, Arbitrum, and Polygon. Further EVM chains wait on confirmed CAIP ids. Verification and settlement are stubs. */
export const evmAdapter: ChainAdapter = createStubAdapter({
  family: 'evm',
  scheme: SCHEME_IDS.evm,
  network: 'eip155:8453',
})

/** Ethereum, Base, Arbitrum, and Polygon. Further EVM chains wait on confirmed CAIP ids. */
export const EVM_NETWORKS = ['eip155:1', 'eip155:8453', 'eip155:42161', 'eip155:137'] as const

/** True when `value` is an EVM address. This does not call an RPC. */
export function isEvmAddress(value: string): boolean {
  return isAddress(value)
}
