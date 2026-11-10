// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Interop (`x402interop-evm`) on EVM chains.
 *
 * The buyer signs EIP-712 terms binding the quote to its origin payment, so
 * this family has the strongest local proof of any interop family: the
 * signature is recoverable and can be checked against `authorization.from`
 * without a node. Everything else - quote validity, deposit address, nonce
 * reuse - comes from the shared binding checks.
 */

import {
  SCHEME_IDS,
  evmChainIdFromNetwork,
  interopEvmTypedData,
  type PaymentPayload,
  type PaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
} from '@x402interop/core'
import { isAddress, recoverTypedDataAddress } from 'viem'
import type { InteropVerificationOptions } from '../shared/interop-verify.js'
import {
  originProofOf,
  hasOriginProof,
  settleInteropFamily,
  verifyInteropFamily,
} from '../shared/interop-verify.js'
import { unsettled } from '../shared/interop-binding.js'

export async function verifyInterop(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: InteropVerificationOptions = {},
): Promise<VerifyResponse> {
  if (requirements.payTo && requirements.payTo.startsWith('0x') && !isAddress(requirements.payTo)) {
    return { isValid: false, invalidReason: 'invalid_recipient' }
  }
  // EVM has always reported an absent binding as `not_implemented` rather than
  // `missing_binding`: a payload with no interop binding may still be an
  // upstream-`exact` payment, which the settlement layer decides. Keeping that
  // distinction here rather than in the shared check keeps it EVM's business.
  const hasBinding =
    (payload.payload as any)?.binding ?? (payload.payload as any)?.authorization?.binding
  if (!hasBinding) {
    return {
      isValid: false,
      invalidReason: 'not_implemented',
      invalidMessage: 'EVM signature verification requires an origin-chain signer',
    }
  }
  return verifyInteropFamily('evm', SCHEME_IDS.evm, payload, requirements, {
    ...(options.store ? { store: options.store } : {}),
    proof:
      options.proof ??
      (async () => {
        const authorization = originProofOf(payload)
        const binding =
          (payload.payload as any)?.binding ?? (payload.payload as any)?.authorization?.binding
        // A binding alone is a well-formed interop payment with no local proof:
        // the settlement layer has to adjudicate it. That is `not_implemented`,
        // not an invalid payment.
        if (!hasOriginProof(authorization)) {
          return {
            isValid: false,
            invalidReason: 'not_implemented',
            invalidMessage: 'EVM signature verification requires an origin-chain signer',
          }
        }
        if (
          typeof binding?.depositAddress === 'string' &&
          binding.depositAddress.startsWith('0x') &&
          !isAddress(binding.depositAddress)
        ) {
          return { isValid: false, invalidReason: 'invalid_binding' }
        }
        const txHash = typeof authorization.txHash === 'string' ? authorization.txHash : undefined
        const signature =
          typeof authorization.signature === 'string' ? authorization.signature : undefined
        if (!txHash || !signature || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
          return {
            isValid: false,
            invalidReason: 'invalid_binding',
            invalidMessage: 'An EVM proof needs both a 32-byte txHash and a signature',
          }
        }
        const originNetwork =
          typeof authorization.originNetwork === 'string' ? authorization.originNetwork : ''
        const chainId = evmChainIdFromNetwork(originNetwork)
        const from = typeof authorization.from === 'string' ? authorization.from : ''
        const originAsset =
          typeof authorization.originAsset === 'string' ? authorization.originAsset : ''
        const originAmount =
          typeof authorization.originAmount === 'string' ? authorization.originAmount : ''
        if (
          chainId === undefined ||
          !isAddress(from) ||
          originAsset.length === 0 ||
          !/^\d+$/.test(originAmount) ||
          typeof binding?.quoteId !== 'string' ||
          typeof binding?.depositAddress !== 'string' ||
          typeof binding?.nonce !== 'string' ||
          typeof binding?.expiresAt !== 'string'
        ) {
          return {
            isValid: false,
            invalidReason: 'invalid_binding',
            invalidMessage: 'The EVM proof is missing origin terms or quote binding fields',
          }
        }
        try {
          const recovered = await recoverTypedDataAddress({
            ...interopEvmTypedData(
              {
                quoteId: binding.quoteId,
                depositAddress: binding.depositAddress as `0x${string}`,
                originNetwork,
                originAsset,
                originAmount: BigInt(originAmount),
                nonce: binding.nonce,
                expiresAt: binding.expiresAt,
              },
              chainId,
            ),
            signature: signature as `0x${string}`,
          })
          if (recovered.toLowerCase() !== from.toLowerCase()) {
            return {
              isValid: false,
              invalidReason: 'invalid_signature',
              invalidMessage: 'The EIP-712 signature does not recover to authorization.from',
            }
          }
          return { isValid: true, payer: recovered, extra: { txHash } }
        } catch {
          return {
            isValid: false,
            invalidReason: 'invalid_signature',
            invalidMessage: 'The EIP-712 signature could not be recovered',
          }
        }
      }),
  })
}

export async function settleInterop(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: InteropVerificationOptions = {},
): Promise<SettleResponse> {
  const verified = await verifyInterop(payload, requirements, options)
  if (!verified.isValid) {
    return unsettled(
      requirements.network,
      verified.invalidReason ?? 'verification_failed',
      verified.invalidMessage,
    )
  }
  const authorization = originProofOf(payload)
  const txHash = typeof authorization.txHash === 'string' ? authorization.txHash : undefined
  if (!txHash) {
    return unsettled(
      requirements.network,
      'invalid_payload',
      'EVM settlement needs the origin transaction hash',
    )
  }
  // The origin txHash is the receipt. It is reported as-is: the buyer signed
  // and broadcast that transaction, and no filler hash is generated in its place.
  return {
    success: true,
    transaction: txHash,
    network: requirements.network,
    ...(verified.payer ? { payer: verified.payer } : {}),
  }
}

export { settleInteropFamily }
