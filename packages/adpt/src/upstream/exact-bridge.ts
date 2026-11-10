// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type {
  ChainFamily,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'

import { resolveExactFacilitator } from './registry.js'

/**
 * The single `exact` entry path for upstream-delegated families. `adpt` never
 * re-implements a scheme an upstream package covers: the implementation comes
 * from the manifest, loaded on first use.
 */
export async function verifyExactFor(
  family: ChainFamily,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const implementation = await resolveExactFacilitator(family)
  if (!implementation) {
    return {
      isValid: false,
      invalidReason: 'unsupported_scheme',
      invalidMessage: `no exact implementation for family "${family}"`,
    }
  }
  const result = (await implementation.verify(payload, requirements)) as
    ({ isValid: boolean } & Partial<VerifyResponse>) | undefined
  if (result && typeof result.isValid === 'boolean') {
    return {
      isValid: result.isValid,
      invalidReason: result.invalidReason,
      invalidMessage: result.invalidMessage,
    }
  }
  return {
    isValid: false,
    invalidReason: 'unexpected_verify_error',
    invalidMessage: `${family} exact verification returned no verdict`,
  }
}

export async function settleExactFor(
  family: ChainFamily,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const implementation = await resolveExactFacilitator(family)
  if (!implementation) {
    return {
      success: false,
      errorReason: 'unsupported_scheme',
      errorMessage: `no exact implementation for family "${family}"`,
      transaction: '',
      network: requirements.network,
    }
  }
  const result = (await implementation.settle(payload, requirements)) as
    ({ success: boolean } & Partial<SettleResponse>) | undefined
  if (result && typeof result.success === 'boolean') {
    return {
      success: result.success,
      errorReason: result.errorReason,
      errorMessage: result.errorMessage,
      transaction: result.transaction ?? '',
      network: result.network ?? requirements.network,
      payer: result.payer,
      amount: result.amount,
      extensions: result.extensions,
      extensionResponses: result.extensionResponses,
      extra: result.extra,
    }
  }
  return {
    success: false,
    errorReason: 'unexpected_settle_error',
    errorMessage: `${family} exact settlement returned no verdict`,
    transaction: '',
    network: requirements.network,
  }
}
