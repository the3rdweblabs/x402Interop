// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  EVM_NETWORKS,
  SCHEME_IDS,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { verifyExactFor, settleExactFor } from '../upstream/exact-bridge.js'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { EVM_NETWORKS } from '@x402interop/core'
export { verifyExactFor as verifyExact, settleExactFor as settleExact }

export { verifyInterop, settleInterop } from './interop.js'

export const evmAdapter: FamilyAdapter = {
  family: 'evm',
  schemes: ['x402interop-evm', 'exact'],
  scheme: SCHEME_IDS.evm,
  network: EVM_NETWORKS[0],
  networks: [...EVM_NETWORKS],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return verifyExactFor('evm', payload, requirements)
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return settleExactFor('evm', payload, requirements)
    return settleInterop(payload, requirements)
  },
}

export default evmAdapter
