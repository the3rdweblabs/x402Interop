// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  SCHEME_IDS,
  TRON_NETWORKS,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { TRON_NETWORKS } from '@x402interop/core'
export { verifyInterop, settleInterop } from './interop.js'

export const tronAdapter: FamilyAdapter = {
  family: 'tron',
  schemes: ['x402interop-tron'],
  scheme: SCHEME_IDS.tron,
  network: TRON_NETWORKS[0],
  networks: [...TRON_NETWORKS],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    return settleInterop(payload, requirements)
  },
}

export default tronAdapter
