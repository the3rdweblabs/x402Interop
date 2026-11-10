// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import { ResilientOneClickClient, type OneClickClient } from '../src/index.js'

const request = {
  originAsset: 'nep141:base-usdc.omft.near',
  destinationAsset: 'nep141:sui-usdc.omft.near',
  amount: '100',
  recipient: 'seller',
  refundTo: 'buyer',
  deadline: '2026-10-27T12:05:00Z',
  swapType: 'EXACT_OUTPUT' as const,
}

function client(overrides: Partial<OneClickClient>): OneClickClient {
  return {
    quote: vi.fn(async () => ({
      quoteId: 'quote',
      depositAddress: 'deposit',
      originAmount: '100',
      destinationAmount: '100',
      timeEstimateSeconds: 45,
      expiresAt: request.deadline,
    })),
    status: vi.fn(async () => ({ status: 'SUCCESS' as const, depositAddress: 'deposit' })),
    submitDeposit: vi.fn(async () => ({ accepted: true })),
    ...overrides,
  }
}

describe('ResilientOneClickClient', () => {
  it('falls back to the next transport and remembers it', async () => {
    const primary = client({
      quote: vi.fn().mockRejectedValue(new Error('sdk unavailable')),
    })
    const fallback = client({})
    const resilient = new ResilientOneClickClient([primary, fallback])

    await expect(resilient.quote(request)).resolves.toMatchObject({ quoteId: 'quote' })
    await resilient.status('deposit')
    expect(fallback.status).toHaveBeenCalledOnce()
  })

  it('retries all transports and preserves the final error', async () => {
    const first = client({
      quote: vi.fn().mockRejectedValue(new Error('first failed')),
    })
    const second = client({
      quote: vi.fn().mockRejectedValue(new Error('last failed')),
    })
    const resilient = new ResilientOneClickClient([first, second])

    await expect(resilient.quote(request)).rejects.toThrow('last failed')
  })

  it('requires at least one transport', () => {
    expect(() => new ResilientOneClickClient([])).toThrow(/needs .* transport/)
  })

  it('forwards a deposit submission to the preferred transport', async () => {
    const primary = client({})
    const resilient = new ResilientOneClickClient([primary])
    await expect(
      resilient.submitDeposit({ depositAddress: 'deposit', txHash: '0xabc' }),
    ).resolves.toEqual({ accepted: true })
    expect(primary.submitDeposit).toHaveBeenCalledOnce()
  })
})
