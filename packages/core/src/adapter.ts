// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { SettleResponse, VerifyResponse } from './facilitator.js'
import type { PaymentPayload, PaymentRequirements } from './payments.js'
import type { ChainFamily } from './schemes.js'

/**
 * One module per buyer chain family. The scaffold returns `not_implemented`
 * and does not talk to a chain.
 */
export interface ChainAdapter {
  readonly family: ChainFamily
  readonly scheme: string
  /** Default network used when a caller has not picked one yet. */
  readonly network: string
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>
}

export function createStubAdapter(options: {
  family: ChainFamily
  scheme: string
  network: string
}): ChainAdapter {
  return {
    family: options.family,
    scheme: options.scheme,
    network: options.network,
    async verify(payload, requirements) {
      if (payload.accepted.scheme !== options.scheme || requirements.scheme !== options.scheme) {
        return { isValid: false, invalidReason: 'scheme_mismatch' }
      }
      return {
        isValid: false,
        invalidReason: 'not_implemented',
        invalidMessage: `${options.family} verification is not implemented in the scaffold`,
      }
    },
    async settle(payload, requirements) {
      if (payload.accepted.scheme !== options.scheme || requirements.scheme !== options.scheme) {
        return {
          success: false,
          errorReason: 'scheme_mismatch',
          transaction: '',
          network: requirements.network,
        }
      }
      return {
        success: false,
        errorReason: 'not_implemented',
        errorMessage: `${options.family} settlement is not implemented in the scaffold`,
        transaction: '',
        network: requirements.network,
      }
    },
  }
}
