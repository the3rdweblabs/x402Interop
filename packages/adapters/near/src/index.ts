// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createStubAdapter, SCHEME_IDS, type ChainAdapter } from '@x402interop/core'
/** Provisional network id. Payments are USDC, not native NEAR. Verification and settlement are stubs. */
export const nearAdapter: ChainAdapter = createStubAdapter({
  family: 'near',
  scheme: SCHEME_IDS.near,
  network: 'near:mainnet',
})

/** Provisional network id. Payments are USDC, not native NEAR. */
export const NEAR_NETWORKS = ['near:mainnet'] as const
