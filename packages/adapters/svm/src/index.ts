// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { SCHEME_IDS, type ChainAdapter, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'

/** Solana mainnet CAIP-2 genesis id. */
export const svmAdapter: ChainAdapter = {
  family: 'svm',
  scheme: SCHEME_IDS.svm,
  network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    if (payload.accepted.scheme !== SCHEME_IDS.svm || requirements.scheme !== SCHEME_IDS.svm) {
      return { isValid: false, invalidReason: 'scheme_mismatch' }
    }
    const binding = (payload.payload as any)?.binding
    if (binding && typeof binding.depositAddress !== 'string') {
      return { isValid: false, invalidReason: 'invalid_binding' }
    }
    return {
      isValid: false,
      invalidReason: 'not_implemented',
      invalidMessage: 'SVM verification is not implemented in the scaffold',
    }
  },
  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const verified = await this.verify(payload, requirements)
    if (verified.invalidReason && verified.invalidReason !== 'not_implemented') {
      return {
        success: false,
        errorReason: verified.invalidReason,
        errorMessage: verified.invalidMessage,
        transaction: '',
        network: requirements.network,
      }
    }
    return {
      success: false,
      errorReason: 'not_implemented',
      errorMessage: 'SVM settlement is not implemented in the scaffold',
      transaction: '',
      network: requirements.network,
    }
  },
}

/** Solana mainnet CAIP-2 genesis id. */
export const SVM_NETWORKS = ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'] as const

export default svmAdapter

