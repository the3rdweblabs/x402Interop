// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Interop for the families whose origin chain has no local node client.
 *
 * `aptos`, `stellar`, `starknet`, `utxo`, `tvm`, `tron`, `xrpl`, and
 * `lightning` all work the same way: the buyer pays on its own chain and the
 * only evidence is an origin `txHash`. Whether that transaction delivered is
 * something the settlement layer knows and a bare adapter does not.
 *
 * So these adapters deliberately report `not_implemented` from `verify` and
 * `settle` instead of inventing a verdict. That is what the previous code did
 * in its unreachable `success: true` branch: it returned a synthesised
 * transaction id (`utxo_…`, `aptos_…`) for a payment nothing had checked. A
 * caller recording that as a receipt was recording a settlement that never
 * happened.
 *
 * Verification for these families runs through the facilitator, which owns
 * the 1Click status lookup (`verifyInteropDeposit` in `@x402interop/facilkit`).
 * Wiring them here would mean duplicating node clients per family; the
 * correct fix is the facilitator path, not a second implementation.
 */

import type {
  ChainFamily,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'
import { SCHEME_IDS } from '@x402interop/core'
import {
  settleInteropFamily,
  verifyInteropFamily,
  type InteropVerificationOptions,
} from './interop-verify.js'
import { notImplemented, unsettled } from './interop-binding.js'

export type SettlementLayerFamily =
  'aptos' | 'stellar' | 'starknet' | 'utxo' | 'ton' | 'tron' | 'xrpl' | 'lightning'

export interface SettlementLayerInterop {
  verifyInterop(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    options?: InteropVerificationOptions,
  ): Promise<VerifyResponse>
  settleInterop(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    options?: InteropVerificationOptions,
  ): Promise<SettleResponse>
}

/**
 * Builds the verify/settle pair for a settlement-layer family. The binding
 * checks still run, so a malformed or replayed payment is rejected with a
 * specific reason rather than a blanket "not implemented".
 */
export function settlementLayerInterop(family: SettlementLayerFamily): SettlementLayerInterop {
  const scheme = SCHEME_IDS[family as ChainFamily]
  const detail =
    `Interop verification for ${family} runs through the facilitator's ` +
    'settlement-status lookup, not a local adapter'

  async function verifyInterop(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    options: InteropVerificationOptions = {},
  ): Promise<VerifyResponse> {
    const verdict = await verifyInteropFamily('other', scheme, payload, requirements, options)
    // A malformed binding is a real answer; only a well-formed payment that
    // needs the settlement layer gets the not_implemented explanation.
    if (verdict.invalidReason && verdict.invalidReason !== 'not_implemented') return verdict
    return notImplemented(family, detail)
  }

  async function settleInterop(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    options: InteropVerificationOptions = {},
  ): Promise<SettleResponse> {
    // Closed over, not `this`: the facilitator calls settle as a bare function.
    const verified = await verifyInterop(payload, requirements, options)
    if (!verified.isValid) {
      return unsettled(
        requirements.network,
        verified.invalidReason ?? 'verification_failed',
        verified.invalidMessage,
      )
    }
    return settleInteropFamily('other', scheme, payload, requirements, options)
  }

  return { verifyInterop, settleInterop }
}
