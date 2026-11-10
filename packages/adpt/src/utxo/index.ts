// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { SCHEME_IDS, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'
import { verifyInterop, settleInterop } from './interop.js'
import type { FamilyAdapter } from '../types.js'

/**
 * Bitcoin-family chains (Bitcoin, BCH, Litecoin, Dash, Zcash, Dogecoin) have
 * no official x402 `exact` spec, so this family is interop-only: the buyer
 * deposits to a single-use address and the quote settles through NEAR
 * Intents.
 */
export { UTXO_NETWORKS } from '@x402interop/core'
export { verifyInterop, settleInterop } from './interop.js'

export const utxoAdapter: FamilyAdapter = {
  family: 'utxo',
  schemes: ['x402interop-utxo'],
  scheme: SCHEME_IDS.utxo,
  network: 'bip122:000000000019d6689c085ae165831e93',
  networks: [
    'bip122:000000000019d6689c085ae165831e93',
    'bip122:000000000000000000651ef99cb9fcbe',
    'bip122:12a765e31ffd4059bada1e25190f6e98',
    'bip122:00000ffd590b1485b3caadc19b22e637',
    'bip122:00040fe8ec8471911baa1db1266ea15d',
    'bip122:1a91e3dace36e2be3bf030a65679fe82',
  ],

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    return verifyInterop(payload, requirements)
  },

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    return settleInterop(payload, requirements)
  },
}

export default utxoAdapter
