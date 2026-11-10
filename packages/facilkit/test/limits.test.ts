// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { MemoryExposureTracker, MemoryRateLimiter } from '../src/limits.js'

const reservation = {
  quoteId: 'q1',
  buyer: 'buyer',
  seller: 'seller',
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: 100n,
  deliveryMode: 'on_deposit' as const,
  expiresAt: '2030-01-01T00:00:00.000Z',
}

describe('MemoryRateLimiter', () => {
  it('allows up to the limit and then reports the retry window', () => {
    const limiter = new MemoryRateLimiter({ windowMs: 1000, max: 2 })
    expect(limiter.take('ip', 0)).toMatchObject({ allowed: true, remaining: 1 })
    expect(limiter.take('ip', 1)).toMatchObject({ allowed: true, remaining: 0 })
    expect(limiter.take('ip', 2)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    })
    expect(limiter.take('ip', 1000)).toMatchObject({ allowed: true })
    limiter.sweep(5000)
    expect(limiter.take('ip', 5000)).toMatchObject({ allowed: true })
  })

  it('rejects invalid configuration', () => {
    expect(() => new MemoryRateLimiter({ windowMs: 0, max: 1 })).toThrow()
    expect(() => new MemoryRateLimiter({ windowMs: 1, max: 0 })).toThrow()
  })
})

describe('MemoryExposureTracker', () => {
  it('caps per buyer and seller for on_deposit', () => {
    const tracker = new MemoryExposureTracker({ perBuyer: 150n, perSeller: 250n })
    expect(tracker.reserve(reservation)).toBe(true)
    expect(tracker.check({ ...reservation, quoteId: 'q2', amount: 60n })).toMatchObject({
      allowed: false,
      buyerUsed: 160n,
      sellerUsed: 160n,
    })
    expect(tracker.check({ ...reservation, quoteId: 'q2', amount: 40n })).toMatchObject({
      allowed: true,
      buyerUsed: 140n,
      sellerUsed: 140n,
    })
    expect(tracker.reserve({ ...reservation, quoteId: 'q2', amount: 40n })).toBe(true)
  })

  it('does not cap on_success or pending_push', () => {
    const tracker = new MemoryExposureTracker({ perBuyer: 1n, perSeller: 1n })
    expect(tracker.check({ ...reservation, deliveryMode: 'on_success' })).toMatchObject({
      allowed: true,
    })
    expect(tracker.reserve({ ...reservation, deliveryMode: 'on_success' })).toBe(true)
    expect(tracker.reserve({ ...reservation, deliveryMode: 'pending_push' })).toBe(true)
  })

  it('applies the seller cap and ignores malformed expiry dates', () => {
    const tracker = new MemoryExposureTracker({ perSeller: 100n })
    expect(tracker.reserve(reservation)).toBe(true)
    expect(tracker.reserve({ ...reservation, quoteId: 'q2', amount: 1n })).toBe(false)
    tracker.release('q1')
    expect(tracker.reserve({ ...reservation, quoteId: 'q3', expiresAt: 'not-a-date' })).toBe(true)
    tracker.sweep(new Date('2030-01-01T00:00:00.000Z'))
    expect(tracker.list().some((entry) => entry.quoteId === 'q3')).toBe(true)
  })

  it('ignores reservations on another network or asset', () => {
    const tracker = new MemoryExposureTracker({ perBuyer: 100n })
    expect(tracker.reserve(reservation)).toBe(true)
    expect(
      tracker.check({ ...reservation, quoteId: 'q2', network: 'near:mainnet', amount: 100n }),
    ).toMatchObject({ allowed: true, buyerUsed: 100n })
    expect(
      tracker.check({ ...reservation, quoteId: 'q3', asset: 'usdt', amount: 100n }),
    ).toMatchObject({ allowed: true, buyerUsed: 100n })
    expect(
      tracker.check({
        ...reservation,
        quoteId: 'q4',
        buyer: 'other',
        seller: 'other',
        amount: 100n,
      }),
    ).toMatchObject({ allowed: true, buyerUsed: 100n })
  })

  it('releases and sweeps reservations', () => {
    const tracker = new MemoryExposureTracker({ perBuyer: 100n })
    expect(tracker.reserve(reservation)).toBe(true)
    expect(tracker.get('q1')).toMatchObject({ quoteId: 'q1' })
    expect(tracker.get('missing')).toBeUndefined()
    tracker.release('q1')
    expect(tracker.list()).toEqual([])

    expect(tracker.reserve({ ...reservation, expiresAt: '2020-01-01T00:00:00.000Z' })).toBe(true)
    tracker.sweep(new Date('2021-01-01T00:00:00.000Z'))
    expect(tracker.list()).toEqual([])
  })
})
