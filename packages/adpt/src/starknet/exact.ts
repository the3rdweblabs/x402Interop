// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Spec-native `exact` on Starknet, built from
 * `docs/specs/schemes/exact/scheme_exact_starknet.md` (mirrored upstream).
 *
 * The scheme is SNIP-9 v2 outside execution over a SNIP-2 token. Everything
 * that can be checked locally is checked here and MUST pass before any RPC
 * call; chain-state checks (signature, nonce, balance, simulation) run through
 * an injected `StarknetExactClient`. Without a client the verifier fails
 * closed with `unexpected_verify_error`, exactly as the spec requires.
 */

import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'

/** `sn_keccak("transfer")` - taken verbatim from the spec. */
export const TRANSFER_SELECTOR =
  '0x0083afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e'
/** SNIP-9 any-caller sentinel the spec forbids in `extra.feePayer`. */
export const ANY_CALLER = '0x414e595f43414c4c4552'
export const STARKNET_NETWORK_IDS = ['starknet:SN_MAIN', 'starknet:SN_SEPOLIA'] as const
export const MIN_SETTLE_MARGIN = 30
export const DEFAULT_SKEW_MARGIN = 60

export interface StarknetExactClient {
  /** `is_valid_signature` on the payer account → SNIP-6 `VALID` magic. */
  isValidSignature(from: string, messageHash: string, signature: string[]): Promise<boolean>
  /** `is_valid_outside_execution_nonce` on the payer account. */
  isNonceUnused(from: string, nonce: string): Promise<boolean>
  /** Balance read; throws when the token exposes neither getter. */
  balanceOf(asset: string, owner: string): Promise<bigint>
  /** Full settlement simulation; throws when the node cannot run it. */
  simulateSettlement(payload: unknown): Promise<void>
}

export interface StarknetExactOptions {
  client?: StarknetExactClient
  now?: number
  skewMargin?: number
  minSettleMargin?: number
}

const U128_MAX = 1n << 128n

function isBase10Integer(value: string): boolean {
  return /^\d+$/.test(value) && value !== '0'
}

function isHexFelt(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)
}

function isAddress(value: unknown): value is string {
  return isHexFelt(value) && value.length === 66 // 0x + 64 hex
}

function feltToBigInt(value: string): bigint {
  return BigInt(value)
}

interface TypedDataView {
  domain?: { chainId?: unknown }
  message?: {
    Caller?: unknown
    Nonce?: unknown
    'Execute After'?: unknown
    'Execute Before'?: unknown
    Calls?: unknown
  }
}

/**
 * Run every locally-checkable rule from the spec and return the stable
 * `invalidReason` token, or `null` when the payload passes (chain checks
 * still pending). All felt comparisons are numeric, never string-based.
 */
export function checkStarknetExactPayload(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: StarknetExactOptions = {},
): string | null {
  const skew = options.skewMargin ?? DEFAULT_SKEW_MARGIN
  const settleFloor = options.minSettleMargin ?? MIN_SETTLE_MARGIN
  const now = Math.floor((options.now ?? Date.now()) / 1000)

  const accepted = payload.accepted
  if (payload.x402Version !== 2) return 'invalid_x402_version'
  if (accepted.scheme !== 'exact' || requirements.scheme !== 'exact') return 'invalid_scheme'
  if (!STARKNET_NETWORK_IDS.includes(accepted.network as (typeof STARKNET_NETWORK_IDS)[number])) {
    return 'invalid_network'
  }
  if (accepted.network !== requirements.network) return 'network_mismatch'
  if (accepted.amount !== requirements.amount)
    return 'invalid_exact_starknet_payload_amount_mismatch'
  if (accepted.asset !== requirements.asset) return 'invalid_exact_starknet_payload_asset_mismatch'
  if (accepted.payTo !== requirements.payTo)
    return 'invalid_exact_starknet_payload_recipient_mismatch'
  if (accepted.maxTimeoutSeconds !== requirements.maxTimeoutSeconds) {
    return 'invalid_exact_starknet_payload_max_timeout_mismatch'
  }

  // Requirement hygiene (spec rule 1).
  if (!isBase10Integer(requirements.amount)) return 'invalid_payment_requirements'
  if (
    !Number.isInteger(requirements.maxTimeoutSeconds) ||
    requirements.maxTimeoutSeconds <= settleFloor
  ) {
    return 'invalid_payment_requirements'
  }
  const feePayer = requirements.extra?.feePayer
  if (typeof feePayer !== 'string' || !isAddress(feePayer)) return 'invalid_payment_requirements'
  if (feltToBigInt(feePayer) === 0n) return 'invalid_payment_requirements'
  if (feePayer === ANY_CALLER) return 'invalid_payment_requirements'
  if (accepted.extra?.feePayer !== feePayer) return 'invalid_payment_requirements'
  if (accepted.extra?.assetTransferMethod && accepted.extra.assetTransferMethod !== 'default') {
    return 'invalid_payment_requirements'
  }
  if (accepted.extra?.paymentFlow && accepted.extra.paymentFlow !== 'authorization') {
    return 'invalid_payment_requirements'
  }

  // Payload shape (spec rules 2, 4, 7).
  const from = (payload.payload as { from?: unknown } | undefined)?.from
  if (!isAddress(from)) return 'invalid_payload'
  if (feltToBigInt(feePayer) === feltToBigInt(from)) return 'invalid_payment_requirements'

  const outside = (payload.payload as { outsideExecution?: unknown } | undefined)?.outsideExecution
  if (!outside || typeof outside !== 'object') return 'invalid_payload'
  const typedData = (outside as { typedData?: unknown }).typedData as TypedDataView | undefined
  const signature = (outside as { signature?: unknown }).signature
  if (!typedData || typeof typedData !== 'object') return 'invalid_payload'
  if (!Array.isArray(signature) || signature.some((s) => !isHexFelt(s))) return 'invalid_payload'
  if (signature.length > 32) return 'invalid_payload'

  const message = typedData.message
  if (!message) return 'invalid_payload'
  if (message.Caller !== feePayer) return 'invalid_exact_starknet_payload_caller'
  if (!isHexFelt(message.Nonce)) return 'invalid_payload'

  const after = message['Execute After']
  const before = message['Execute Before']
  if (typeof after !== 'string' || typeof before !== 'string') return 'invalid_payload'
  let executeAfter: bigint
  let executeBefore: bigint
  try {
    executeAfter = feltToBigInt(after)
    executeBefore = feltToBigInt(before)
  } catch {
    return 'invalid_payload'
  }

  // Time window (spec Timeout Mapping).
  if (executeAfter >= BigInt(now - skew)) return 'invalid_payload'
  if (executeBefore < BigInt(now + requirements.maxTimeoutSeconds - skew)) {
    return 'outside_execution_expired'
  }
  if (executeBefore > BigInt(now + requirements.maxTimeoutSeconds + skew)) {
    return 'outside_execution_window_exceeds_max_timeout'
  }
  if (executeBefore <= BigInt(now + settleFloor)) return 'outside_execution_expired'

  // Exactly one call transferring `asset` → `payTo` for exactly `amount`.
  const calls = message.Calls
  if (!Array.isArray(calls) || calls.length !== 1) return 'invalid_payload'
  const call = calls[0] as { To?: unknown; Selector?: unknown; Calldata?: unknown }
  if (call.To !== accepted.asset) return 'invalid_exact_starknet_payload_asset_mismatch'
  if (call.Selector !== TRANSFER_SELECTOR) return 'invalid_exact_starknet_payload_asset_mismatch'
  const calldata = call.Calldata
  if (!Array.isArray(calldata) || calldata.length !== 3) {
    return 'invalid_exact_starknet_payload_amount_mismatch'
  }
  const [recipient, amountLow, amountHigh] = calldata as unknown[]
  if (recipient !== accepted.payTo) return 'invalid_exact_starknet_payload_recipient_mismatch'
  if (!isHexFelt(amountLow) || !isHexFelt(amountHigh)) {
    return 'invalid_exact_starknet_payload_amount_mismatch'
  }
  let low: bigint
  let high: bigint
  try {
    low = feltToBigInt(amountLow)
    high = feltToBigInt(amountHigh)
  } catch {
    return 'invalid_exact_starknet_payload_amount_mismatch'
  }
  if (low >= U128_MAX || high >= U128_MAX) return 'invalid_exact_starknet_payload_amount_mismatch'
  if (low + (high << 128n) !== BigInt(accepted.amount)) {
    return 'invalid_exact_starknet_payload_amount_mismatch'
  }

  return null
}

async function chainChecks(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: StarknetExactOptions,
): Promise<string | null> {
  const client = options.client
  if (!client) return 'unexpected_verify_error'
  try {
    const from = (payload.payload as { from: string }).from
    const typedData = (
      (payload.payload as { outsideExecution: unknown }).outsideExecution as {
        typedData: TypedDataView
      }
    ).typedData
    const signature = (
      (payload.payload as { outsideExecution: unknown }).outsideExecution as {
        signature: string[]
      }
    ).signature
    const message = typedData.message as Record<string, string>

    if (!(await client.isValidSignature(from, '0x0', signature))) {
      return 'invalid_exact_starknet_payload_signature'
    }
    if (!(await client.isNonceUnused(from, message.Nonce))) return 'nonce_already_used'
    if ((await client.balanceOf(requirements.asset, from)) < BigInt(requirements.amount)) {
      return 'insufficient_funds'
    }
    await client.simulateSettlement(payload)
  } catch {
    // A node that could not answer is an absent answer, not a verdict.
    return 'unexpected_verify_error'
  }
  return null
}

export async function verifyExact(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: StarknetExactOptions = {},
): Promise<VerifyResponse> {
  const localReason = checkStarknetExactPayload(payload, requirements, options)
  if (localReason) return { isValid: false, invalidReason: localReason }
  const chainReason = await chainChecks(payload, requirements, options)
  if (chainReason) return { isValid: false, invalidReason: chainReason }
  return { isValid: true }
}

export async function settleExact(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: StarknetExactOptions = {},
): Promise<SettleResponse> {
  const verified = await verifyExact(payload, requirements, options)
  if (!verified.isValid) {
    return {
      success: false,
      errorReason: verified.invalidReason || 'verification_failed',
      errorMessage: verified.invalidMessage,
      transaction: '',
      network: requirements.network,
    }
  }
  // Settlement is the facilitated `execute_from_outside_v2` INVOKE. Without a
  // configured sponsor the failure is structural, not fabricated success.
  const client = options.client
  const sponsor = client as
    | (StarknetExactClient & {
        settle?(payload: unknown): Promise<{ transaction: string }>
      })
    | undefined
  if (!sponsor || typeof sponsor.settle !== 'function') {
    return {
      success: false,
      errorReason: 'unexpected_settle_error',
      errorMessage: 'no Starknet settlement sponsor configured',
      transaction: '',
      network: requirements.network,
    }
  }
  const result = await sponsor.settle(payload)
  return { success: true, transaction: result.transaction, network: requirements.network }
}
