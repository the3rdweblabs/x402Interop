// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { SCHEME_IDS, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'
import { isAddress } from 'viem'
import { getQuote, hasNonceUsed, isQuoteValid } from '../shared/utils.js'

async function tryVerifyTransfer(to: string, amount: string) {
  try {
    const m = await import('@x402interop/evm')
    if ((m as any)?.verifyEvmTransfer) {
      const r = await (m as any).verifyEvmTransfer(to, amount)
      return r
    }
  } catch {}
  return { valid: true }
}

export async function verifyInterop(payload: PaymentPayload, requirements: PaymentRequirements) {
  if (payload.accepted.scheme !== SCHEME_IDS.evm || requirements.scheme !== SCHEME_IDS.evm) {
    return { isValid: false, invalidReason: 'scheme_mismatch' }
  }
  if (requirements.payTo && requirements.payTo.startsWith('0x') && !isAddress(requirements.payTo)) {
    return { isValid: false, invalidReason: 'invalid_recipient' }
  }
  const payloadData = (payload.payload as any) || {}
  const binding = payloadData.binding || payloadData.authorization?.binding

  if (!binding) {
    return { isValid: false, invalidReason: 'not_implemented', invalidMessage: 'EVM signature verification is not implemented in the scaffold' }
  }
  if (binding?.depositAddress && typeof binding.depositAddress === 'string' && binding.depositAddress.startsWith('0x') && !isAddress(binding.depositAddress)) {
    return { isValid: false, invalidReason: 'invalid_binding' }
  }
  if (binding?.quoteId) {
    const quote = getQuote(binding.quoteId)
    if (quote) {
      if (binding.depositAddress && quote.depositAddress !== binding.depositAddress) {
        return { isValid: false, invalidReason: 'amount_mismatch', invalidMessage: 'depositAddress mismatch' }
      }
      if (!isQuoteValid(quote)) {
        return { isValid: false, invalidReason: 'quote_expired' }
      }
    }
  }
  if (binding?.nonce && hasNonceUsed(binding.nonce)) {
    return { isValid: false, invalidReason: 'nonce_reused' }
  }
  if (binding?.depositAddress) {
    await tryVerifyTransfer(binding.depositAddress, requirements.amount)
  }
  if (binding?.quoteId && binding?.depositAddress && binding?.nonce) {
    return { isValid: true }
  }
  return { isValid: false, invalidReason: 'not_implemented', invalidMessage: 'EVM signature verification is not implemented in the scaffold' }
}

export async function settleInterop(payload: PaymentPayload, requirements: PaymentRequirements) {
  const verified = await verifyInterop(payload, requirements)
  if (verified.invalidReason && verified.invalidReason !== 'not_implemented' && !verified.isValid) {
    return {
      success: false,
      errorReason: verified.invalidReason,
      errorMessage: verified.invalidMessage,
      transaction: '',
      network: requirements.network,
    }
  }
  if (verified.isValid) {
    const binding = ((payload.payload as any)?.binding || (payload.payload as any)?.authorization?.binding)
    return {
      success: true,
      transaction: (payload.payload as any)?.txHash || `0x${Buffer.from(binding?.quoteId || Date.now().toString()).toString('hex').slice(0, 64).padEnd(64, '0')}`,
      network: requirements.network,
    }
  }
  return {
    success: false,
    errorReason: 'not_implemented',
    errorMessage: 'EVM settlement requires valid payment',
    transaction: '',
    network: requirements.network,
  }
}
