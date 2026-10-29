// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { PaymentPayload, PaymentRequirements, VerifyResponse } from '@x402interop/core'
import { isInteropScheme } from '@x402interop/core'
import { evmAdapter } from '@x402interop/evm'
import { svmAdapter } from '@x402interop/svm'
import { suiAdapter } from '@x402interop/sui'
import { nearAdapter } from '@x402interop/near'
import { tonAdapter } from '@x402interop/ton'
import { tronAdapter } from '@x402interop/tron'
import { xrplAdapter } from '@x402interop/xrpl'
import { lightningAdapter } from '@x402interop/lightning'

const adapters: Record<string, any> = {
  'x402interop-evm': evmAdapter,
  'x402interop-svm': svmAdapter,
  'x402interop-sui': suiAdapter,
  'x402interop-near': nearAdapter,
  'x402interop-tvm': tonAdapter,
  'x402interop-tron': tronAdapter,
  'x402interop-xrpl': xrplAdapter,
  'x402interop-lightning': lightningAdapter,
}

export async function verifyWithAdapter(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const adapter = adapters[requirements.scheme]
  if (!adapter) {
    return { isValid: false, invalidReason: 'unsupported_scheme' }
  }
  try {
    const result = await adapter.verify(payload, requirements)
    return result
  } catch (err) {
    return {
      isValid: false,
      invalidReason: 'unexpected_error',
      invalidMessage: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function settleWithAdapter(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<any> {
  const adapter = adapters[requirements.scheme]
  if (!adapter) {
    return {
      success: false,
      errorReason: 'unsupported_scheme',
      errorMessage: 'No adapter for scheme',
      transaction: '',
      network: requirements.network,
    }
  }
  try {
    const result = await adapter.settle(payload, requirements)
    return result
  } catch (err) {
    return {
      success: false,
      errorReason: 'unexpected_error',
      errorMessage: err instanceof Error ? err.message : String(err),
      transaction: '',
      network: requirements.network,
    }
  }
}
