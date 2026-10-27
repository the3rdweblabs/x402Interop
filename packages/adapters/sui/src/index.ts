// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createStubAdapter, SCHEME_IDS, type ChainAdapter } from '@x402interop/core'
/** Provisional network id from the scheme draft. Confirm the CAIP id before mainnet. Verification and settlement are stubs. */
export const suiAdapter: ChainAdapter = createStubAdapter({
  family: 'sui',
  scheme: SCHEME_IDS.sui,
  network: 'sui:mainnet',
})

/** Provisional network id from the scheme draft. Confirm the CAIP id before mainnet. */
export const SUI_NETWORKS = ['sui:mainnet'] as const
