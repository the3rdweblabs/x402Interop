// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  SVM_NETWORKS,
  SCHEME_IDS,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { verifyExactFor, settleExactFor } from '../upstream/exact-bridge.js'
import { verifyInterop, settleInterop, type SvmInteropOptions } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { SVM_NETWORKS } from '@x402interop/core'
export { verifyExactFor as verifyExact, settleExactFor as settleExact }

export { verifyInterop, settleInterop } from './interop.js'
export type { SvmInteropClient, SvmInteropOptions } from './interop.js'

/**
 * Builds the Solana adapter. Interop options are per-instance so a facilitator
 * can hand the adapter its quote store and RPC client; `svmAdapter` below is
 * the stateless instance used for capability discovery.
 */
export function createSvmAdapter(interop: SvmInteropOptions = {}): FamilyAdapter {
  return {
    family: 'svm',
    schemes: ['x402interop-svm', 'exact'],
    scheme: SCHEME_IDS.svm,
    network: SVM_NETWORKS[0],
    networks: [...SVM_NETWORKS],

    async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
      const scheme = requirements.scheme || payload.accepted?.scheme
      if (scheme === 'exact') return verifyExactFor('svm', payload, requirements)
      return verifyInterop(payload, requirements, interop)
    },

    async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
      const scheme = requirements.scheme || payload.accepted?.scheme
      if (scheme === 'exact') return settleExactFor('svm', payload, requirements)
      return settleInterop(payload, requirements, interop)
    },
  }
}

export const svmAdapter: FamilyAdapter = createSvmAdapter()

export default svmAdapter
