// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createStubAdapter, SCHEME_IDS, type ChainAdapter } from '@x402interop/core'
/** Solana mainnet CAIP-2 genesis id. Verification and settlement are stubs. */
export const svmAdapter: ChainAdapter = createStubAdapter({
  family: 'svm',
  scheme: SCHEME_IDS.svm,
  network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
})

/** Solana mainnet CAIP-2 genesis id. */
export const SVM_NETWORKS = ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'] as const
