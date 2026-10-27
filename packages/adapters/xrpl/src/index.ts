// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createStubAdapter, SCHEME_IDS, type ChainAdapter } from '@x402interop/core'
/** Network id is provisional until the XRPL spec is reviewed. Verification and settlement are stubs. */
export const xrplAdapter: ChainAdapter = createStubAdapter({
  family: 'xrpl',
  scheme: SCHEME_IDS.xrpl,
  network: 'xrpl:mainnet',
})

/** Network id is provisional until the XRPL spec is reviewed. */
export const XRPL_NETWORKS = ['xrpl:mainnet'] as const
