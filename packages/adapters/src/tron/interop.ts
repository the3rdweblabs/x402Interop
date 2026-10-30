// SPDX-License-Identifier: GPL-3.0-or-later
// [native]
import { SCHEME_IDS, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'
import { getQuote, hasNonceUsed, isQuoteValid } from '../shared/utils.js'

export async function verifyInterop(payload: PaymentPayload, requirements: PaymentRequirements) {
  if (payload.accepted.scheme !== SCHEME_IDS.tron || requirements.scheme !== SCHEME_IDS.tron) return { isValid: false, invalidReason: 'scheme_mismatch' }
  const payloadData = (payload.payload as any) || {}
  const binding = payloadData.binding || payloadData.authorization?.binding
  if (!binding) return { isValid: false, invalidReason: 'missing_binding' }
  if (binding?.quoteId) {
    const quote = getQuote(binding.quoteId)
    if (quote && !isQuoteValid(quote)) return { isValid: false, invalidReason: 'quote_expired' }
    if (quote && binding.depositAddress && quote.depositAddress !== binding.depositAddress) return { isValid: false, invalidReason: 'amount_mismatch' }
  }
  if (binding?.nonce && hasNonceUsed(binding.nonce)) return { isValid: false, invalidReason: 'nonce_reused' }
  if (binding?.quoteId && binding?.depositAddress && binding?.nonce) return { isValid: true }
  return { isValid: false, invalidReason: 'missing_binding' }
}

export async function settleInterop(payload: PaymentPayload, requirements: PaymentRequirements) {
  const verified = await verifyInterop(payload, requirements)
  if (!verified.isValid) return { success: false, errorReason: verified.invalidReason || 'verification_failed', errorMessage: verified.invalidMessage, transaction: '', network: requirements.network }
  const binding = ((payload.payload as any)?.binding || (payload.payload as any)?.authorization?.binding)
  return { success: true, transaction: (payload.payload as any)?.txHash || (payload.payload as any)?.hash || ('tron' + '_' + (binding?.quoteId || Date.now().toString()).slice(0, 12)), network: requirements.network }
}
