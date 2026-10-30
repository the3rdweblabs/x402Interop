// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'
import { verifyExact, settleExact } from './exact.js'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { EVM_NETWORKS } from '@x402interop/core'
export { verifyExact, settleExact } from './exact.js'
export { verifyInterop, settleInterop } from './interop.js'

export const evmAdapter: FamilyAdapter = {
  family: 'evm',
  schemes: ['x402interop-evm', 'exact'],
  scheme: SCHEME_IDS.evm,
  network: ['eip155:1','eip155:8453','eip155:42161','eip155:137'][0] || 'evm:mainnet',
  networks: ['eip155:1','eip155:8453','eip155:42161','eip155:137'],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return verifyExact(payload, requirements)
    if (scheme === SCHEME_IDS.evm || scheme === 'x402interop-evm') return verifyInterop(payload, requirements)
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return settleExact(payload, requirements)
    if (scheme === SCHEME_IDS.evm || scheme === 'x402interop-evm') return settleInterop(payload, requirements)
    return settleInterop(payload, requirements)
  },
}

export default evmAdapter
