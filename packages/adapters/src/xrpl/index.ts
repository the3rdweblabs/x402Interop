// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'
import { verifyExact, settleExact } from './exact.js'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { XRPL_NETWORKS } from '@x402interop/core'
export { verifyExact, settleExact } from './exact.js'
export { verifyInterop, settleInterop } from './interop.js'

export const xrplAdapter: FamilyAdapter = {
  family: 'xrpl',
  schemes: ['x402interop-xrpl', 'exact'],
  scheme: SCHEME_IDS.xrpl,
  network: ['xrpl:mainnet'][0] || 'xrpl:mainnet',
  networks: ['xrpl:mainnet'],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return verifyExact(payload, requirements)
    if (scheme === SCHEME_IDS.xrpl || scheme === 'x402interop-xrpl') return verifyInterop(payload, requirements)
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return settleExact(payload, requirements)
    if (scheme === SCHEME_IDS.xrpl || scheme === 'x402interop-xrpl') return settleInterop(payload, requirements)
    return settleInterop(payload, requirements)
  },
}

export default xrplAdapter
