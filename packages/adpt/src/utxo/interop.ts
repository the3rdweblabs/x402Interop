// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Interop (`x402interop-utxo`) on utxo.
 *
 * The origin chain reports only a transaction hash, and the settlement layer
 * is the sole authority on whether that transaction delivered. This adapter
 * therefore never returns a verdict of its own (see `shared/settlement-layer.ts`).
 */

import { settlementLayerInterop } from '../shared/settlement-layer.js'

export const { verifyInterop, settleInterop } = settlementLayerInterop('utxo')
export type { InteropVerificationOptions } from '../shared/interop-verify.js'
