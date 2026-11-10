// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  LIGHTNING_NETWORKS,
  SCHEME_IDS,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { verifyExact, settleExact } from './exact.js'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { LIGHTNING_NETWORKS } from '@x402interop/core'
export {
  checkLnbtcPayment,
  decodeBolt11Invoice,
  isValidCompressedPubkey,
  isValidPreimage,
  type DecodedBolt11Invoice,
  type InvoiceDecoder,
  type LnExactOptions,
  type ReplayStore,
  verifyExact,
  settleExact,
} from './exact.js'
export { verifyInterop, settleInterop } from './interop.js'

export const lightningAdapter: FamilyAdapter = {
  family: 'lightning',
  schemes: ['x402interop-lightning', 'exact'],
  scheme: SCHEME_IDS.lightning,
  network: LIGHTNING_NETWORKS[0],
  networks: [...LIGHTNING_NETWORKS],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return verifyExact(payload, requirements)
    if (scheme === SCHEME_IDS.lightning || scheme === 'x402interop-lightning')
      return verifyInterop(payload, requirements)
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return settleExact(payload, requirements)
    if (scheme === SCHEME_IDS.lightning || scheme === 'x402interop-lightning')
      return settleInterop(payload, requirements)
    return settleInterop(payload, requirements)
  },
}

export default lightningAdapter
