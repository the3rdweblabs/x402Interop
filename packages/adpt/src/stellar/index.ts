// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  STELLAR_NETWORKS,
  SCHEME_IDS,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { verifyExactFor, settleExactFor } from '../upstream/exact-bridge.js'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { STELLAR_NETWORKS } from '@x402interop/core'
export { verifyExactFor as verifyExact, settleExactFor as settleExact }

export { verifyInterop, settleInterop } from './interop.js'

export const stellarAdapter: FamilyAdapter = {
  family: 'stellar',
  schemes: ['x402interop-stellar', 'exact'],
  scheme: SCHEME_IDS.stellar,
  network: STELLAR_NETWORKS[0],
  networks: [...STELLAR_NETWORKS],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return verifyExactFor('stellar', payload, requirements)
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return settleExactFor('stellar', payload, requirements)
    return settleInterop(payload, requirements)
  },
}

export default stellarAdapter
