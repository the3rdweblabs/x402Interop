// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  X402_VERSION,
  type SettleRequest,
  type SupportedKind,
  type VerifyRequest,
} from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import {
  facilitatorRequestSchema,
  settlePayment,
  supportedResponse,
  verifyPayment,
} from '../src/index.js'

const now = new Date('2026-10-27T12:00:00Z')

function request(overrides: Partial<VerifyRequest> = {}): VerifyRequest {
  const requirements = {
    scheme: 'x402interop-evm',
    network: 'sui:mainnet',
    asset: 'usdc',
    amount: '50000',
    payTo: 'seller',
    maxTimeoutSeconds: 300,
    extra: { expiresAt: '2026-10-27T12:05:00Z' },
  }
  return {
    x402Version: X402_VERSION,
    paymentRequirements: requirements,
    paymentPayload: {
      x402Version: X402_VERSION,
      accepted: requirements,
      payload: {},
    },
    ...overrides,
  }
}

describe('facilkit', () => {
  it('wraps supported kinds with the x402interop extension id', () => {
    const kinds: SupportedKind[] = [
      { x402Version: X402_VERSION, scheme: 'x402interop-evm', network: 'eip155:8453' },
    ]
    expect(supportedResponse(kinds).extensions).toEqual(['x402interop'])
  })

  it('parses a facilitator request', () => {
    expect(facilitatorRequestSchema.safeParse(request()).success).toBe(true)
    expect(facilitatorRequestSchema.safeParse({ x402Version: 2 }).success).toBe(false)
  })

  it('flags version, scheme, and expiry before the unimplemented signature check', () => {
    expect(verifyPayment(request({ x402Version: 1 }), now).invalidReason).toBe(
      'unsupported_version',
    )
    const mismatched = request()
    mismatched.paymentPayload = {
      ...mismatched.paymentPayload,
      accepted: { ...mismatched.paymentRequirements, scheme: 'x402interop-sui' },
    }
    expect(verifyPayment(mismatched, now).invalidReason).toBe('scheme_mismatch')
    const expired = request()
    expired.paymentRequirements = {
      ...expired.paymentRequirements,
      extra: { expiresAt: '2026-10-27T11:00:00Z' },
    }
    expect(verifyPayment(expired, now).invalidReason).toBe('quote_expired')
    const junkExpiry = request()
    junkExpiry.paymentRequirements = {
      ...junkExpiry.paymentRequirements,
      extra: { expiresAt: 'yesterday' },
    }
    expect(verifyPayment(junkExpiry, now).invalidReason).toBe('not_implemented')
    const numericExpiry = request()
    numericExpiry.paymentRequirements = {
      ...numericExpiry.paymentRequirements,
      extra: { expiresAt: 1 },
    }
    expect(verifyPayment(numericExpiry, now).invalidReason).toBe('not_implemented')
    const open = request()
    open.paymentRequirements = { ...open.paymentRequirements, extra: undefined }
    expect(verifyPayment(open, now).invalidReason).toBe('not_implemented')
    expect(verifyPayment(request(), now).invalidReason).toBe('not_implemented')
  })

  it('propagates a real verify failure and otherwise refuses to settle', () => {
    const expired = request() as SettleRequest
    expired.paymentRequirements = {
      ...expired.paymentRequirements,
      extra: { expiresAt: '2026-10-27T11:00:00Z' },
    }
    expect(settlePayment(expired, now)).toMatchObject({
      success: false,
      errorReason: 'quote_expired',
      transaction: '',
    })
    expect(settlePayment(request() as SettleRequest, now).errorReason).toBe('not_implemented')
  })

  it('validates x402interop bindings when present', () => {
    const req = request()
    // missing binding
    expect(verifyPayment({ ...req, paymentPayload: { ...req.paymentPayload, payload: { binding: {} } } }, now).invalidReason).toBe('invalid_binding')
    const validBinding = {
      quoteId: 'q1',
      depositAddress: '0xabc',
      nonce: 'n1',
      expiresAt: '2026-10-27T12:04:00Z',
    }
    req.paymentRequirements.extra = { quoteId: 'q1', depositAddress: '0xabc', expiresAt: '2026-10-27T12:05:00Z' }
    const okReq = {
      ...req,
      paymentPayload: { ...req.paymentPayload, payload: { binding: validBinding } },
    }
    expect(verifyPayment(okReq, now).invalidReason).toBe('not_implemented')
    // binding.quoteId mismatch
    expect(verifyPayment({ ...okReq, paymentPayload: { ...okReq.paymentPayload, payload: { binding: { ...validBinding, quoteId: 'bad' } } } }, now).invalidReason).toBe('amount_mismatch')
    // binding.depositAddress mismatch
    expect(verifyPayment({ ...okReq, paymentPayload: { ...okReq.paymentPayload, payload: { binding: { ...validBinding, depositAddress: '0xbad' } } } }, now).invalidReason).toBe('amount_mismatch')
    // binding.expiresAt too late
    expect(verifyPayment({ ...okReq, paymentPayload: { ...okReq.paymentPayload, payload: { binding: { ...validBinding, expiresAt: '2026-10-27T12:10:00Z' } } } }, now).invalidReason).toBe('quote_expired')
    // binding at top level
    expect(verifyPayment({ ...okReq, paymentPayload: { ...okReq.paymentPayload, payload: {}, binding: validBinding } as any }, now).invalidReason).toBe('not_implemented')
    // nonce missing
    expect(verifyPayment({ ...okReq, paymentPayload: { ...okReq.paymentPayload, payload: { binding: { ...validBinding, nonce: '' } } } }, now).invalidReason).toBe('nonce_reused')
    // quoteId missing
    expect(verifyPayment({ ...okReq, paymentPayload: { ...okReq.paymentPayload, payload: { binding: { ...validBinding, quoteId: '' } } } }, now).invalidReason).toBe('invalid_binding')
    // depositAddress missing
    expect(verifyPayment({ ...okReq, paymentPayload: { ...okReq.paymentPayload, payload: { binding: { ...validBinding, depositAddress: '' } } } }, now).invalidReason).toBe('invalid_binding')
    // expiresAt missing
    expect(verifyPayment({ ...okReq, paymentPayload: { ...okReq.paymentPayload, payload: { binding: { ...validBinding, expiresAt: '' } } } }, now).invalidReason).toBe('quote_expired')
  })
})
