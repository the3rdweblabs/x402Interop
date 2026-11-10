// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  NEAR_NETWORKS,
  SCHEME_IDS,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { verifyExactFor, settleExactFor } from '../upstream/exact-bridge.js'
import { verifyInterop, settleInterop, type NearInteropOptions } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { NEAR_NETWORKS } from '@x402interop/core'
export { verifyExactFor as verifyExact, settleExactFor as settleExact }

export { verifyInterop, settleInterop } from './interop.js'
export type { NearInteropClient, NearInteropOptions } from './interop.js'

/**
 * Builds the NEAR adapter. Interop options are per-instance so a facilitator
 * can hand the adapter its quote store and RPC client; `nearAdapter` below is
 * the stateless instance used for capability discovery.
 */
export function createNearAdapter(interop: NearInteropOptions = {}): FamilyAdapter {
  return {
    family: 'near',
    schemes: ['x402interop-near', 'exact'],
    scheme: SCHEME_IDS.near,
    network: NEAR_NETWORKS[0],
    networks: [...NEAR_NETWORKS],

    async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
      const scheme = requirements.scheme || payload.accepted?.scheme
      if (scheme === 'exact') return verifyExactFor('near', payload, requirements)
      return verifyInterop(payload, requirements, interop)
    },

    async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
      const scheme = requirements.scheme || payload.accepted?.scheme
      if (scheme === 'exact') return settleExactFor('near', payload, requirements)
      return settleInterop(payload, requirements, interop)
    },
  }
}

export const nearAdapter: FamilyAdapter = createNearAdapter()

export default nearAdapter
