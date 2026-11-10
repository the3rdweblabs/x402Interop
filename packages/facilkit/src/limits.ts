// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { DeliveryMode } from '@x402interop/core'

export interface RateLimitOptions {
  windowMs: number
  max: number
}

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/** Sliding fixed-window limiter. In-process only; use Redis for multi-instance hosts. */
export class MemoryRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>()

  constructor(private readonly options: RateLimitOptions) {
    if (options.windowMs <= 0 || options.max <= 0) {
      throw new Error('Rate limit window and max must be positive')
    }
  }

  take(key: string, now: number = Date.now()): RateLimitDecision {
    const existing = this.buckets.get(key)
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs })
      return { allowed: true, remaining: this.options.max - 1, retryAfterSeconds: 0 }
    }
    if (existing.count >= this.options.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      }
    }
    existing.count += 1
    return {
      allowed: true,
      remaining: this.options.max - existing.count,
      retryAfterSeconds: 0,
    }
  }

  sweep(now: number = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
  }
}

export interface ExposureLimits {
  perBuyer?: bigint
  perSeller?: bigint
}

export interface ExposureReservation {
  quoteId: string
  buyer: string
  seller: string
  network: string
  asset: string
  amount: bigint
  deliveryMode: DeliveryMode
  expiresAt: string
}

export interface ExposureDecision {
  allowed: boolean
  buyerUsed: bigint
  sellerUsed: bigint
}

/**
 * Tracks seller exposure for `on_deposit`, where the seller serves before the
 * swap reaches a terminal state. Limits are atomic units per buyer/seller and
 * are only comparable within the same network+asset.
 *
 * In-process only; a multi-instance deployment needs a shared store.
 */
export class MemoryExposureTracker {
  private readonly reservations = new Map<string, ExposureReservation>()

  constructor(private readonly limits: ExposureLimits = {}) {}

  private used(
    buyer: string,
    seller: string,
    network: string,
    asset: string,
  ): {
    buyer: bigint
    seller: bigint
  } {
    let buyerUsed = 0n
    let sellerUsed = 0n
    for (const reservation of this.reservations.values()) {
      if (reservation.network !== network || reservation.asset !== asset) continue
      if (reservation.buyer === buyer) buyerUsed += reservation.amount
      if (reservation.seller === seller) sellerUsed += reservation.amount
    }
    return { buyer: buyerUsed, seller: sellerUsed }
  }

  check(input: ExposureReservation): ExposureDecision {
    if (input.deliveryMode !== 'on_deposit') {
      return { allowed: true, buyerUsed: 0n, sellerUsed: 0n }
    }
    const current = this.used(input.buyer, input.seller, input.network, input.asset)
    const buyerUsed = current.buyer + input.amount
    const sellerUsed = current.seller + input.amount
    return {
      allowed:
        (this.limits.perBuyer === undefined || buyerUsed <= this.limits.perBuyer) &&
        (this.limits.perSeller === undefined || sellerUsed <= this.limits.perSeller),
      buyerUsed,
      sellerUsed,
    }
  }

  reserve(input: ExposureReservation): boolean {
    if (!this.check(input).allowed) return false
    this.reservations.set(input.quoteId, input)
    return true
  }

  release(quoteId: string): void {
    this.reservations.delete(quoteId)
  }

  get(quoteId: string): ExposureReservation | undefined {
    return this.reservations.get(quoteId)
  }

  list(): ExposureReservation[] {
    return [...this.reservations.values()]
  }

  sweep(now: Date = new Date()): void {
    for (const [quoteId, reservation] of this.reservations) {
      const expiry = Date.parse(reservation.expiresAt)
      if (Number.isFinite(expiry) && expiry <= now.getTime()) {
        this.reservations.delete(quoteId)
      }
    }
  }
}
