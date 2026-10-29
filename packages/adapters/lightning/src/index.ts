// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createStubAdapter, SCHEME_IDS, type ChainAdapter } from '@x402interop/core'
/** Payer-only top-up. lightning:mainnet is a provisional id, not a CAIP-2 chain. Verification and settlement are stubs. */
export const lightningAdapter: ChainAdapter = createStubAdapter({
  family: 'lightning',
  scheme: SCHEME_IDS.lightning,
  network: 'lightning:mainnet',
})

/** Payer-only top-up. lightning:mainnet is a provisional id, not a CAIP-2 chain. */
export const LIGHTNING_NETWORKS = ['lightning:mainnet'] as const
