// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { PaymentPayload, type PaymentRequirements } from '@x402interop/core'

async function tryUpstream() {
  const candidates = ['@x402/evm', '@x402/ethereum', '@x402/core']
  for (const mod of candidates) {
    try {
      // @ts-ignore
      const m = await import(mod)
      if (m?.verifyPayment) return { verify: m.verifyPayment, settle: m.settlePayment }
      if (m?.verify) return { verify: m.verify, settle: m.settle }
      if (m?.exact?.verifyPayment) return { verify: m.exact.verifyPayment, settle: m.exact.settlePayment }
      if (m?.schemes?.evm?.verifyPayment) return { verify: m.schemes.evm.verifyPayment, settle: m.schemes.evm.settlePayment }
    } catch {}
  }
  return null
}

export async function verifyExact(payload: PaymentPayload, requirements: PaymentRequirements) {
  const upstream = await tryUpstream()
  if (upstream?.verify) {
    const res = await upstream.verify(payload, requirements)
    if (res && typeof res.isValid === 'boolean') return res
  }
  throw new Error('standard_exact_not_available: @x402/evm not installed')
}

export async function settleExact(payload: PaymentPayload, requirements: PaymentRequirements) {
  const upstream = await tryUpstream()
  if (upstream?.settle) {
    const res = await upstream.settle(payload, requirements)
    if (res && typeof res.success === 'boolean') return res
  }
  throw new Error('standard_exact_not_available: @x402/evm not installed')
}
