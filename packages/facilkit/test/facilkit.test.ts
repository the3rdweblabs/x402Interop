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
import { settleWithAdapter, verifyWithAdapter } from '../src/verifier.js'

const now = new Date('2026-10-27T12:00:00Z')

function request(overrides: Partial<VerifyRequest> = {}): VerifyRequest {
  const requirements = {
    scheme: 'x402interop-evm',
    network: 'eip155:8453' as const,
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

  it('flags version, scheme, and expiry before the unimplemented signature check', async () => {
    expect((await verifyPayment(request({ x402Version: 1 }), now)).invalidReason).toBe(
      'unsupported_version',
    )
    const mismatched = request()
    mismatched.paymentPayload = {
      ...mismatched.paymentPayload,
      accepted: { ...mismatched.paymentRequirements, scheme: 'x402interop-sui' },
    }
    expect((await verifyPayment(mismatched, now)).invalidReason).toBe('scheme_mismatch')
    const expired = request()
    expired.paymentRequirements = {
      ...expired.paymentRequirements,
      extra: { expiresAt: '2026-10-27T11:00:00Z' },
    }
    expect((await verifyPayment(expired, now)).invalidReason).toBe('quote_expired')
    const junkExpiry = request()
    junkExpiry.paymentRequirements = {
      ...junkExpiry.paymentRequirements,
      extra: { expiresAt: 'yesterday' },
    }
    expect((await verifyPayment(junkExpiry, now)).invalidReason).toBe('not_implemented')
    const numericExpiry = request()
    numericExpiry.paymentRequirements = {
      ...numericExpiry.paymentRequirements,
      extra: { expiresAt: 1 },
    }
    expect((await verifyPayment(numericExpiry, now)).invalidReason).toBe('not_implemented')
    const open = request()
    open.paymentRequirements = { ...open.paymentRequirements, extra: {} }
    expect((await verifyPayment(open, now)).invalidReason).toBe('not_implemented')
    expect((await verifyPayment(request(), now)).invalidReason).toBe('not_implemented')
  })

  it('propagates a real verify failure and otherwise refuses to settle', async () => {
    const expired = request() as SettleRequest
    expired.paymentRequirements = {
      ...expired.paymentRequirements,
      extra: { expiresAt: '2026-10-27T11:00:00Z' },
    }
    expect(await settlePayment(expired, now)).toMatchObject({
      success: false,
      errorReason: 'quote_expired',
      transaction: '',
    })
    expect((await settlePayment(request() as SettleRequest, now)).errorReason).toBe(
      'not_implemented',
    )
  })

  it('routes unknown schemes and propagating errors through the adapter registry', async () => {
    expect(
      (
        await verifyWithAdapter(request().paymentPayload, {
          ...request().paymentRequirements,
          scheme: 'nope',
        })
      ).invalidReason,
    ).toBe('unsupported_scheme')
    expect(
      (
        await settleWithAdapter(request().paymentPayload, {
          ...request().paymentRequirements,
          scheme: 'nope',
        })
      ).errorReason,
    ).toBe('unsupported_scheme')
    const ok = request()
    ok.paymentPayload.payload = {
      binding: {
        quoteId: 'q1',
        depositAddress: '0x1111111111111111111111111111111111111111',
        nonce: 'n1',
        expiresAt: '2026-10-27T12:04:00Z',
      },
    }
    expect((await settleWithAdapter(ok.paymentPayload, ok.paymentRequirements)).success).toBe(false)
    for (const scheme of [
      'x402interop-aptos',
      'x402interop-stellar',
      'x402interop-starknet',
      'x402interop-utxo',
    ]) {
      const closed = request()
      closed.paymentRequirements = { ...closed.paymentRequirements, scheme }
      closed.paymentPayload = {
        ...closed.paymentPayload,
        accepted: { ...closed.paymentRequirements },
        payload: {
          binding: {
            quoteId: 'q1',
            depositAddress: '0x1111111111111111111111111111111111111111',
            nonce: 'n1',
            expiresAt: '2026-10-27T12:04:00Z',
          },
        },
      }
      expect(
        (await verifyWithAdapter(closed.paymentPayload, closed.paymentRequirements)).invalidReason,
      ).toBe('not_implemented')
      expect(
        (await settleWithAdapter(closed.paymentPayload, closed.paymentRequirements)).errorReason,
      ).toBe('not_implemented')
    }
  })

  it('settles a structurally valid binding through the adapter', async () => {
    const req = request() as SettleRequest
    const deposit = '0x1111111111111111111111111111111111111111'
    req.paymentRequirements = { ...req.paymentRequirements, payTo: deposit }
    req.paymentPayload.payload = {
      binding: {
        quoteId: 'q1',
        depositAddress: deposit,
        nonce: 'n2',
        expiresAt: '2026-10-27T12:04:00Z',
      },
    }
    const result = await settlePayment(req, now)
    expect(result.success).toBe(false)
    expect(result.errorReason).toBe('not_implemented')
    expect(result.transaction).toBe('')
  })

  it('refuses a non-object binding with missing_binding', async () => {
    const req = request()
    const result = await verifyPayment(
      { ...req, paymentPayload: { ...req.paymentPayload, payload: { binding: 'oops' } } } as any,
      now,
    )
    expect(result.invalidReason).toBe('missing_binding')
  })

  it('validates x402interop bindings when present', async () => {
    const req = request()
    // missing binding
    expect(
      (
        await verifyPayment(
          { ...req, paymentPayload: { ...req.paymentPayload, payload: { binding: {} } } },
          now,
        )
      ).invalidReason,
    ).toBe('invalid_binding')
    const deposit = '0x1111111111111111111111111111111111111111'
    const validBinding = {
      quoteId: 'q1',
      depositAddress: deposit,
      nonce: 'n1',
      expiresAt: '2026-10-27T12:04:00Z',
    }
    req.paymentRequirements.extra = {
      quoteId: 'q1',
      depositAddress: deposit,
      expiresAt: '2026-10-27T12:05:00Z',
    }
    req.paymentRequirements.payTo = deposit
    const okReq = {
      ...req,
      paymentPayload: { ...req.paymentPayload, payload: { binding: validBinding } },
    }
    expect((await verifyPayment(okReq, now)).isValid).toBe(false)
    expect((await verifyPayment(okReq, now)).invalidReason).toBe('not_implemented')
    // binding.quoteId mismatch
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentPayload: {
              ...okReq.paymentPayload,
              payload: { binding: { ...validBinding, quoteId: 'bad' } },
            },
          },
          now,
        )
      ).invalidReason,
    ).toBe('amount_mismatch')
    // binding.depositAddress mismatch
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentPayload: {
              ...okReq.paymentPayload,
              payload: {
                binding: {
                  ...validBinding,
                  depositAddress: '0x2222222222222222222222222222222222222222',
                },
              },
            },
          },
          now,
        )
      ).invalidReason,
    ).toBe('amount_mismatch')
    // binding.expiresAt too late
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentPayload: {
              ...okReq.paymentPayload,
              payload: { binding: { ...validBinding, expiresAt: '2026-10-27T12:10:00Z' } },
            },
          },
          now,
        )
      ).invalidReason,
    ).toBe('quote_expired')
    // binding at top level is ignored
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentPayload: { ...okReq.paymentPayload, payload: {}, binding: validBinding } as any,
          },
          now,
        )
      ).invalidReason,
    ).toBe('not_implemented')
    // nonce missing
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentPayload: {
              ...okReq.paymentPayload,
              payload: { binding: { ...validBinding, nonce: '' } },
            },
          },
          now,
        )
      ).invalidReason,
    ).toBe('nonce_reused')
    // quoteId missing
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentPayload: {
              ...okReq.paymentPayload,
              payload: { binding: { ...validBinding, quoteId: '' } },
            },
          },
          now,
        )
      ).invalidReason,
    ).toBe('invalid_binding')
    // depositAddress missing
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentPayload: {
              ...okReq.paymentPayload,
              payload: { binding: { ...validBinding, depositAddress: '' } },
            },
          },
          now,
        )
      ).invalidReason,
    ).toBe('invalid_binding')
    // expiresAt missing
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentPayload: {
              ...okReq.paymentPayload,
              payload: { binding: { ...validBinding, expiresAt: '' } },
            },
          },
          now,
        )
      ).invalidReason,
    ).toBe('quote_expired')
    // a vacant payTo does not constrain the bound deposit address
    expect(
      (
        await verifyPayment(
          {
            ...okReq,
            paymentRequirements: { ...okReq.paymentRequirements, payTo: '' },
          },
          now,
        )
      ).invalidReason,
    ).toBe('not_implemented')
  })
})
