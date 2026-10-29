// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { SCHEME_IDS, type ChainAdapter, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'

/** Provisional network id from the scheme draft. Confirm the CAIP id before mainnet. */
export const suiAdapter: ChainAdapter = {
  family: 'sui',
  scheme: SCHEME_IDS.sui,
  network: 'sui:mainnet',
  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    if (payload.accepted.scheme !== SCHEME_IDS.sui || requirements.scheme !== SCHEME_IDS.sui) {
      return { isValid: false, invalidReason: 'scheme_mismatch' }
    }
    const binding = (payload.payload as any)?.binding
    if (binding && typeof binding.depositAddress !== 'string') {
      return { isValid: false, invalidReason: 'invalid_binding' }
    }
    return {
      isValid: false,
      invalidReason: 'not_implemented',
      invalidMessage: 'Sui verification is not implemented in the scaffold',
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
      errorMessage: 'Sui settlement is not implemented in the scaffold',
      transaction: '',
      network: requirements.network,
    }
  },
}

/** Provisional network id from the scheme draft. Confirm the CAIP id before mainnet. */
export const SUI_NETWORKS = ['sui:mainnet'] as const

export default suiAdapter

