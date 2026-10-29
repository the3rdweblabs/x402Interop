// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createStubAdapter, SCHEME_IDS, type ChainAdapter } from '@x402interop/core'
/** The scheme id is x402interop-tvm. The network id is provisional. Verification and settlement are stubs. */
export const tonAdapter: ChainAdapter = createStubAdapter({
  family: 'ton',
  scheme: SCHEME_IDS.ton,
  network: 'ton:mainnet',
})

/** The scheme id is x402interop-tvm. The network id is provisional. */
export const TON_NETWORKS = ['ton:mainnet'] as const
