// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { PaymentPayload, PaymentRequirements, VerifyResponse } from '@x402interop/core'
import type {
  ExactAdapter,
  InteropQuoteStore,
  NearInteropClient,
  SuiInteropClient,
  SvmInteropClient,
} from '@x402interop/adpt'
import { settleInterop as settleEvm, verifyInterop as verifyEvm } from '@x402interop/adpt/evm'
import { settleInterop as settleSvm, verifyInterop as verifySvm } from '@x402interop/adpt/svm'
import { settleInterop as settleSui, verifyInterop as verifySui } from '@x402interop/adpt/sui'
import { settleInterop as settleNear, verifyInterop as verifyNear } from '@x402interop/adpt/near'
import { settleInterop as settleTon, verifyInterop as verifyTon } from '@x402interop/adpt/ton'
import { settleInterop as settleTron, verifyInterop as verifyTron } from '@x402interop/adpt/tron'
import { settleInterop as settleXrpl, verifyInterop as verifyXrpl } from '@x402interop/adpt/xrpl'
import {
  settleInterop as settleLightning,
  verifyInterop as verifyLightning,
} from '@x402interop/adpt/lightning'
import { settleInterop as settleAptos, verifyInterop as verifyAptos } from '@x402interop/adpt/aptos'
import {
  settleInterop as settleStellar,
  verifyInterop as verifyStellar,
} from '@x402interop/adpt/stellar'
import {
  settleInterop as settleStarknet,
  verifyInterop as verifyStarknet,
} from '@x402interop/adpt/starknet'
import { settleInterop as settleUtxo, verifyInterop as verifyUtxo } from '@x402interop/adpt/utxo'

/**
 * State the facilitator owns and hands to every interop family. `svm`, `sui`,
 * and `near` also take a node client; without one they fail closed.
 */
export interface InteropAdapterContext {
  store?: InteropQuoteStore
  clients?: {
    svm?: SvmInteropClient
    sui?: SuiInteropClient
    near?: NearInteropClient
  }
}

type InteropCall = (
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: { store?: InteropQuoteStore; client?: SvmInteropClient | SuiInteropClient | NearInteropClient },
) => Promise<any>

// Each family types its own client. The cast is safe because `optionsFor`
// attaches only the client named by that entry.
const interop: Record<string, { verify: InteropCall; settle: InteropCall; client?: 'svm' | 'sui' | 'near' }> = {
  'x402interop-evm': { verify: verifyEvm as InteropCall, settle: settleEvm as InteropCall },
  'x402interop-svm': { verify: verifySvm as InteropCall, settle: settleSvm as InteropCall, client: 'svm' },
  'x402interop-sui': { verify: verifySui as InteropCall, settle: settleSui as InteropCall, client: 'sui' },
  'x402interop-near': { verify: verifyNear as InteropCall, settle: settleNear as InteropCall, client: 'near' },
  'x402interop-tvm': { verify: verifyTon as InteropCall, settle: settleTon as InteropCall },
  'x402interop-tron': { verify: verifyTron as InteropCall, settle: settleTron as InteropCall },
  'x402interop-xrpl': { verify: verifyXrpl as InteropCall, settle: settleXrpl as InteropCall },
  'x402interop-lightning': { verify: verifyLightning as InteropCall, settle: settleLightning as InteropCall },
  'x402interop-aptos': { verify: verifyAptos as InteropCall, settle: settleAptos as InteropCall },
  'x402interop-stellar': { verify: verifyStellar as InteropCall, settle: settleStellar as InteropCall },
  'x402interop-starknet': { verify: verifyStarknet as InteropCall, settle: settleStarknet as InteropCall },
  'x402interop-utxo': { verify: verifyUtxo as InteropCall, settle: settleUtxo as InteropCall },
}

function optionsFor(
  entry: { client?: 'svm' | 'sui' | 'near' },
  context: InteropAdapterContext | undefined,
): { store?: InteropQuoteStore; client?: SvmInteropClient | SuiInteropClient | NearInteropClient } {
  const client = entry.client ? context?.clients?.[entry.client] : undefined
  return {
    ...(context?.store ? { store: context.store } : {}),
    ...(client ? { client } : {}),
  }
}

export async function verifyWithAdapter(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  exact?: Record<string, ExactAdapter>,
  context?: InteropAdapterContext,
): Promise<VerifyResponse> {
  if (requirements.scheme === 'exact') {
    const adapter = exact?.[requirements.network]
    if (!adapter) return { isValid: false, invalidReason: 'unsupported_scheme' }
    try {
      return await adapter.verify(payload, requirements)
    } catch (err) {
      return {
        isValid: false,
        invalidReason: 'unexpected_error',
        invalidMessage: err instanceof Error ? err.message : String(err),
      }
    }
  }
  const entry = interop[requirements.scheme]
  if (!entry) {
    return { isValid: false, invalidReason: 'unsupported_scheme' }
  }
  try {
    return await entry.verify(payload, requirements, optionsFor(entry, context))
  } catch (err) {
    /* v8 ignore start -- defensive: internally registered adapters never throw */
    return {
      isValid: false,
      invalidReason: 'unexpected_error',
      invalidMessage: err instanceof Error ? err.message : String(err),
    }
    /* v8 ignore stop */
  }
}

export async function settleWithAdapter(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  exact?: Record<string, ExactAdapter>,
  context?: InteropAdapterContext,
): Promise<any> {
  if (requirements.scheme === 'exact') {
    const adapter = exact?.[requirements.network]
    if (!adapter) {
      return {
        success: false,
        errorReason: 'unsupported_scheme',
        errorMessage: 'No exact adapter for this network',
        transaction: '',
        network: requirements.network,
      }
    }
    try {
      return await adapter.settle(payload, requirements)
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
  const entry = interop[requirements.scheme]
  if (!entry) {
    return {
      success: false,
      errorReason: 'unsupported_scheme',
      errorMessage: 'No adapter for scheme',
      transaction: '',
      network: requirements.network,
    }
  }
  try {
    return await entry.settle(payload, requirements, optionsFor(entry, context))
  } catch (err) {
    /* v8 ignore start -- defensive: internally registered adapters never throw */
    return {
      success: false,
      errorReason: 'unexpected_error',
      errorMessage: err instanceof Error ? err.message : String(err),
      transaction: '',
      network: requirements.network,
    }
    /* v8 ignore stop */
  }
}
