// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  isInteropScheme,
  paymentRequirementsSchema,
  SCHEME_IDS,
  X402_VERSION,
  type SettleRequest,
  type SettleResponse,
  type SupportedKind,
  type SupportedResponse,
  type VerifyRequest,
  type VerifyResponse,
} from '@x402interop/core'
import { z } from 'zod'
import type { ExactAdapter } from '@x402interop/adpt'
import { settleWithAdapter, verifyWithAdapter, type InteropAdapterContext } from './verifier.js'

export { settleWithAdapter, verifyWithAdapter } from './verifier.js'

export * from './status.js'
export * from './store.js'
export * from './pg-store.js'
export * from './mcp.js'
export * from './auth.js'
export * from './fees.js'
export * from './config.js'
export * from './persistence.js'
export * from './services.js'
export * from './limits.js'
export { supportedKinds } from './supported.js'
export {
  createInteropFacilitator,
  handleMcpRequest,
  methodOf,
  requestPath,
  type CreateInteropFacilitatorOptions,
  type HttpResult,
  type InteropFacilitator,
  type ServiceHealthChecker,
  type ServiceHealthCheckResult,
} from './facilitator.js'

const paymentPayloadSchema = z.looseObject({
  x402Version: z.number(),
  accepted: paymentRequirementsSchema,
  payload: z.record(z.string(), z.unknown()),
  resource: z.any().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
})

/** Minimal status surface the facilitator needs from a 1Click client. */
export interface InteropStatusLookup {
  status(
    depositAddress: string,
    depositMemo?: string,
  ): Promise<{
    status: string
    depositAddress?: string
    originTxHash?: string
    destinationTxHash?: string
  }>
}

export interface SimulatedDepositRecord {
  depositAddress: string
  txHash: string
}

export interface InteropVerificationOptions {
  /** Query the cross-chain settlement layer for the deposit. */
  interopStatus?: InteropStatusLookup
  /** Exact-scheme adapters, keyed by CAIP-2 network. */
  exact?: Record<string, ExactAdapter>
  /**
   * Mock and simulator only. Called after an EVM proof verifies and before
   * the settlement status is read, so the signed payment can stand in for
   * the origin deposit. Live mode must not set this.
   */
  recordSimulatedDeposit?: (deposit: SimulatedDepositRecord) => Promise<void>
  /** Quote and nonce state. Adapters use it to reject expired quotes and replayed nonces. */
  store?: InteropAdapterContext['store']
  /** Node clients for the families that verify an origin transaction locally. */
  interopClients?: InteropAdapterContext['clients']
}

function adapterContext(options: InteropVerificationOptions): InteropAdapterContext | undefined {
  if (!options.store && !options.interopClients) return undefined
  return {
    ...(options.store ? { store: options.store } : {}),
    ...(options.interopClients ? { clients: options.interopClients } : {}),
  }
}

/** Body shared by `/verify` and `/settle`. */
export const facilitatorRequestSchema = z.object({
  x402Version: z.number(),
  paymentPayload: paymentPayloadSchema,
  paymentRequirements: paymentRequirementsSchema,
})

export function supportedResponse(
  kinds: SupportedKind[],
  signers: Record<string, string[]> = {},
): SupportedResponse {
  return {
    kinds,
    extensions: ['x402interop'],
    signers,
  }
}

function validateInteropBinding(
  request: VerifyRequest,
): { ok: true } | { ok: false; reason: string; message?: string } {
  const requirements = request.paymentRequirements as any
  const payload = request.paymentPayload as any
  const binding = payload?.payload?.binding ?? payload?.binding
  if (!binding || typeof binding !== 'object') {
    return { ok: false, reason: 'missing_binding', message: 'x402interop payload requires binding' }
  }
  const quoteId = binding.quoteId
  const depositAddress = binding.depositAddress
  const nonce = binding.nonce
  const expiresAt = binding.expiresAt
  if (typeof quoteId !== 'string' || quoteId.length === 0) {
    return { ok: false, reason: 'invalid_binding', message: 'binding.quoteId is required' }
  }
  if (typeof depositAddress !== 'string' || depositAddress.length === 0) {
    return { ok: false, reason: 'invalid_binding', message: 'binding.depositAddress is required' }
  }
  if (typeof nonce !== 'string' || nonce.length === 0) {
    return { ok: false, reason: 'nonce_reused', message: 'binding.nonce is required' }
  }
  if (typeof expiresAt !== 'string' || expiresAt.length === 0) {
    return { ok: false, reason: 'quote_expired', message: 'binding.expiresAt is required' }
  }
  const extra = requirements.extra as any
  if (extra?.quoteId && extra.quoteId !== quoteId) {
    return { ok: false, reason: 'amount_mismatch', message: 'binding.quoteId does not match quote' }
  }
  if (extra?.depositAddress && extra.depositAddress !== depositAddress) {
    return {
      ok: false,
      reason: 'amount_mismatch',
      message: 'binding.depositAddress does not match quote',
    }
  }
  if (typeof requirements.payTo === 'string' && requirements.payTo.length > 0) {
    if (requirements.payTo !== depositAddress) {
      return {
        ok: false,
        reason: 'invalid_binding',
        message: 'binding.depositAddress does not match requirements.payTo',
      }
    }
  }
  if (extra?.expiresAt && typeof extra.expiresAt === 'string') {
    if (expiresAt > extra.expiresAt) {
      return {
        ok: false,
        reason: 'quote_expired',
        message: 'binding.expiresAt exceeds quote expiry',
      }
    }
  }
  return { ok: true }
}

/** Structural checks + adapter verification. */
export async function verifyPayment(
  request: VerifyRequest,
  now: Date = new Date(),
  options: InteropVerificationOptions = {},
): Promise<VerifyResponse> {
  if (request.x402Version !== X402_VERSION) {
    return { isValid: false, invalidReason: 'unsupported_version' }
  }
  if (request.paymentPayload.accepted.scheme !== request.paymentRequirements.scheme) {
    return { isValid: false, invalidReason: 'scheme_mismatch' }
  }
  const expiresAt = (request.paymentRequirements as any).extra?.expiresAt
  if (typeof expiresAt === 'string') {
    const expiry = Date.parse(expiresAt)
    if (Number.isFinite(expiry) && expiry <= now.getTime()) {
      return { isValid: false, invalidReason: 'quote_expired' }
    }
  }
  if (isInteropScheme(request.paymentRequirements.scheme)) {
    const payload = request.paymentPayload as any
    const binding = payload?.payload?.binding ?? payload?.binding
    const extra = (request.paymentRequirements as any).extra
    if (binding || extra?.quoteId || extra?.depositAddress) {
      const bindingCheck = validateInteropBinding(request)
      if (!bindingCheck.ok) {
        return {
          isValid: false,
          invalidReason: bindingCheck.reason,
          invalidMessage: bindingCheck.message,
        }
      }
    }
  }

  const statusCheck = await verifyInteropDeposit(request, options)
  if (statusCheck) return statusCheck

  // Try adapter-based verification
  try {
    const adapterResult = await verifyWithAdapter(
      request.paymentPayload as any,
      request.paymentRequirements,
      options.exact,
      adapterContext(options),
    )
    return adapterResult
  } catch (err) {
    /* v8 ignore start -- defensive: internally registered adapters never throw */
    return {
      isValid: false,
      invalidReason: 'not_implemented',
      invalidMessage: err instanceof Error ? err.message : 'Signature checks failed',
    }
    /* v8 ignore stop */
  }
}

/**
 * The cross-chain settlement layer is the source of truth once a proof
 * carrying an origin `txHash` is present. A deposit is accepted only after
 * 1Click reports `SUCCESS`; pending states are reported so the buyer retries.
 */
async function verifyInteropDeposit(
  request: VerifyRequest,
  options: InteropVerificationOptions,
): Promise<VerifyResponse | undefined> {
  if (!options.interopStatus || !isInteropScheme(request.paymentRequirements.scheme)) {
    return undefined
  }
  const payment = request.paymentPayload as any
  const binding = payment?.payload?.binding ?? payment?.binding
  const authorization = payment?.payload?.authorization ?? {}
  const txHash = typeof authorization.txHash === 'string' ? authorization.txHash : undefined
  if (!binding || !txHash) return undefined
  if (request.paymentRequirements.scheme === SCHEME_IDS.evm) {
    const proofCheck = await verifyWithAdapter(
      request.paymentPayload as any,
      request.paymentRequirements,
      options.exact,
      adapterContext(options),
    )
    if (!proofCheck.isValid) {
      return proofCheck
    }
    if (options.recordSimulatedDeposit) {
      try {
        await options.recordSimulatedDeposit({
          depositAddress: binding.depositAddress,
          txHash,
        })
      } catch {
        return {
          isValid: false,
          invalidReason: 'status_unavailable',
          invalidMessage: 'The simulated deposit could not be recorded',
        }
      }
    }
  }
  const extra = (request.paymentRequirements as any).extra
  const deliveryMode =
    extra?.deliveryMode === 'on_success' || extra?.deliveryMode === 'pending_push'
      ? extra.deliveryMode
      : 'on_deposit'
  const refundTo = typeof extra?.refundTo === 'string' ? extra.refundTo : undefined
  const depositMemo = typeof extra?.depositMemo === 'string' ? extra.depositMemo : undefined
  let status: Awaited<ReturnType<InteropStatusLookup['status']>>
  try {
    status = depositMemo
      ? await options.interopStatus.status(binding.depositAddress, depositMemo)
      : await options.interopStatus.status(binding.depositAddress)
  } catch {
    return {
      isValid: false,
      invalidReason: 'status_unavailable',
      invalidMessage: 'The settlement status could not be read',
    }
  }
  const payer = typeof authorization.from === 'string' ? authorization.from : undefined
  if (status.status === 'SUCCESS') {
    return {
      isValid: true,
      ...(payer ? { payer } : {}),
      extra: {
        swapStatus: status.status,
        depositAddress: binding.depositAddress,
        quoteId: binding.quoteId,
        originTxHash: status.originTxHash ?? txHash,
        deliveryMode,
        deliverable: true,
        ...(refundTo ? { refundTo } : {}),
        ...(status.destinationTxHash ? { destinationTxHash: status.destinationTxHash } : {}),
      },
    }
  }
  if (status.status === 'KNOWN_DEPOSIT_TX' || status.status === 'PROCESSING') {
    if (deliveryMode === 'on_deposit') {
      return {
        isValid: true,
        ...(payer ? { payer } : {}),
        extra: {
          swapStatus: status.status,
          depositAddress: binding.depositAddress,
          quoteId: binding.quoteId,
          originTxHash: status.originTxHash ?? txHash,
          deliveryMode,
          deliverable: true,
          ...(refundTo ? { refundTo } : {}),
        },
      }
    }
    return {
      isValid: false,
      invalidReason: 'payment_pending',
      invalidMessage: `Cross-chain settlement is ${status.status.toLowerCase()}`,
      extra: {
        swapStatus: status.status,
        depositAddress: binding.depositAddress,
        deliveryMode,
        deliverable: false,
        pendingPush: deliveryMode === 'pending_push',
        ...(refundTo ? { refundTo } : {}),
      },
    }
  }
  if (status.status === 'PENDING_DEPOSIT') {
    return {
      isValid: false,
      invalidReason: 'payment_not_found',
      invalidMessage: 'No origin deposit has been seen for this quote',
      extra: {
        swapStatus: status.status,
        depositAddress: binding.depositAddress,
        deliveryMode,
        deliverable: false,
        ...(refundTo ? { refundTo } : {}),
      },
    }
  }
  const refunded = status.status === 'REFUNDED' || status.status === 'INCOMPLETE_DEPOSIT'
  return {
    isValid: false,
    invalidReason: 'payment_failed',
    invalidMessage: `Cross-chain settlement ended as ${status.status}`,
    extra: {
      swapStatus: status.status,
      depositAddress: binding.depositAddress,
      deliveryMode,
      deliverable: false,
      refund: {
        status: refunded ? 'refunded' : 'failed',
        ...(refundTo ? { to: refundTo } : {}),
        automatic: refunded,
      },
    },
  }
}

export async function settlePayment(
  request: SettleRequest,
  now: Date = new Date(),
  options: InteropVerificationOptions = {},
): Promise<SettleResponse> {
  const verified = await verifyPayment(request, now, options)
  if (verified.invalidReason && verified.invalidReason !== 'not_implemented') {
    return {
      success: false,
      errorReason: verified.invalidReason,
      errorMessage: verified.invalidMessage,
      transaction: '',
      network: request.paymentRequirements.network,
    }
  }
  if (
    options.interopStatus &&
    isInteropScheme(request.paymentRequirements.scheme) &&
    verified.isValid
  ) {
    const extra = verified.extra as Record<string, unknown>
    return {
      success: true,
      transaction: extra.originTxHash as string,
      network: request.paymentRequirements.network,
      ...(verified.payer ? { payer: verified.payer } : {}),
      amount: request.paymentRequirements.amount,
      extra,
    }
  }
  try {
    const result = (await settleWithAdapter(
      request.paymentPayload as any,
      request.paymentRequirements,
      options.exact,
      adapterContext(options),
    )) as SettleResponse
    if (result.success && request.paymentRequirements.scheme === 'exact') {
      const extra = (request.paymentRequirements.extra ?? {}) as Record<string, unknown>
      const deliveryMode =
        extra.deliveryMode === 'on_success' || extra.deliveryMode === 'pending_push'
          ? extra.deliveryMode
          : 'on_deposit'
      return {
        ...result,
        extra: {
          ...(result.extra ?? {}),
          deliveryMode,
          deliverable: deliveryMode === 'on_deposit',
          ...(typeof extra.refundTo === 'string' ? { refundTo: extra.refundTo } : {}),
        },
      }
    }
    return result
  } catch (err) {
    /* v8 ignore start -- defensive: adpt adapters do not throw */
    return {
      success: false,
      errorReason: 'unexpected_error',
      errorMessage: err instanceof Error ? err.message : String(err),
      transaction: '',
      network: request.paymentRequirements.network,
    }
    /* v8 ignore stop */
  }
}
