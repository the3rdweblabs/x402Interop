// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createStubAdapter, SCHEME_IDS, type ChainAdapter } from '@x402interop/core'
/** The Tron scheme is still open. Network id is provisional. Verification and settlement are stubs. */
export const tronAdapter: ChainAdapter = createStubAdapter({
  family: 'tron',
  scheme: SCHEME_IDS.tron,
  network: 'tron:mainnet',
})

/** The Tron scheme is still open. Network id is provisional. */
export const TRON_NETWORKS = ['tron:mainnet'] as const
