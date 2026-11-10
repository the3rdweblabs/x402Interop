// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { SCHEME_IDS, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'
import { verifyExact, settleExact } from './exact.js'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

export { STARKNET_NETWORKS } from '@x402interop/core'
export {
  ANY_CALLER,
  checkStarknetExactPayload,
  TRANSFER_SELECTOR,
  type StarknetExactClient,
  type StarknetExactOptions,
} from './exact.js'
export { verifyExact, settleExact } from './exact.js'
export { verifyInterop, settleInterop } from './interop.js'

export const starknetAdapter: FamilyAdapter = {
  family: 'starknet',
  schemes: ['x402interop-starknet', 'exact'],
  scheme: SCHEME_IDS.starknet,
  network: 'starknet:SN_MAIN',
  networks: ['starknet:SN_MAIN'],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return verifyExact(payload, requirements)
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const scheme = requirements.scheme || payload.accepted?.scheme
    if (scheme === 'exact') return settleExact(payload, requirements)
    return settleInterop(payload, requirements)
  },
}

export default starknetAdapter
