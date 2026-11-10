// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  APTOS_NETWORKS,
  SCHEME_IDS,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { verifyExactFor, settleExactFor } from '../upstream/exact-bridge.js'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { APTOS_NETWORKS } from '@x402interop/core'
export { verifyExactFor as verifyExact, settleExactFor as settleExact }

export { verifyInterop, settleInterop } from './interop.js'

export const aptosAdapter: FamilyAdapter = {
  family: 'aptos',
  schemes: ['x402interop-aptos', 'exact'],
  scheme: SCHEME_IDS.aptos,
  network: APTOS_NETWORKS[0],
  networks: [...APTOS_NETWORKS],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return verifyExactFor('aptos', payload, requirements)
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return settleExactFor('aptos', payload, requirements)
    return settleInterop(payload, requirements)
  },
}

export default aptosAdapter
