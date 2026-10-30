// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'
import { verifyExact, settleExact } from './exact.js'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { SVM_NETWORKS } from '@x402interop/core'
export { verifyExact, settleExact } from './exact.js'
export { verifyInterop, settleInterop } from './interop.js'

export const svmAdapter: FamilyAdapter = {
  family: 'svm',
  schemes: ['x402interop-svm', 'exact'],
  scheme: SCHEME_IDS.svm,
  network: ['solana:mainnet','solana:devnet'][0] || 'svm:mainnet',
  networks: ['solana:mainnet','solana:devnet'],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return verifyExact(payload, requirements)
    if (scheme === SCHEME_IDS.svm || scheme === 'x402interop-svm') return verifyInterop(payload, requirements)
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return settleExact(payload, requirements)
    if (scheme === SCHEME_IDS.svm || scheme === 'x402interop-svm') return settleInterop(payload, requirements)
    return settleInterop(payload, requirements)
  },
}

export default svmAdapter
