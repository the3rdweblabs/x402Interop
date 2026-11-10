// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  SCHEME_IDS,
  SUI_NETWORKS,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { verifyExact, settleExact } from './exact.js'
import { verifyInterop, settleInterop, type SuiInteropOptions } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { SUI_NETWORKS } from '@x402interop/core'
export {
  checkSuiExactPayload,
  type SuiExactClient,
  type SuiExactOptions,
  verifyExact,
  settleExact,
} from './exact.js'
export { verifyInterop, settleInterop } from './interop.js'
export type { SuiInteropClient, SuiInteropOptions } from './interop.js'

/**
 * Builds the Sui adapter. Interop options are per-instance so a facilitator
 * can hand the adapter its quote store and RPC client; `suiAdapter` below is
 * the stateless instance used for capability discovery.
 */
export function createSuiAdapter(interop: SuiInteropOptions = {}): FamilyAdapter {
  return {
    family: 'sui',
    schemes: ['x402interop-sui', 'exact'],
    scheme: SCHEME_IDS.sui,
    network: SUI_NETWORKS[0],
    networks: [...SUI_NETWORKS],

    async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
      const scheme = requirements.scheme || payload.accepted?.scheme
      if (scheme === 'exact') return verifyExact(payload, requirements)
      return verifyInterop(payload, requirements, interop)
    },

    async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
      const scheme = requirements.scheme || payload.accepted?.scheme
      if (scheme === 'exact') return settleExact(payload, requirements)
      return settleInterop(payload, requirements, interop)
    },
  }
}

export const suiAdapter: FamilyAdapter = createSuiAdapter()

export default suiAdapter
