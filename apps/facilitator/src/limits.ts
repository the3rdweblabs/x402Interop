// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { ExposureLimits, RateLimitOptions } from '@x402interop/facilkit'

function positiveInteger(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${name} must be a positive integer`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function atomic(name: string, raw: string | undefined): bigint | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${name} must be an atomic integer string`)
  return BigInt(raw.trim())
}

export function readRateLimit(env: NodeJS.ProcessEnv = process.env): RateLimitOptions | undefined {
  const max = positiveInteger('RATE_LIMIT_MAX', env.RATE_LIMIT_MAX)
  if (max === undefined) return undefined
  return {
    windowMs: positiveInteger('RATE_LIMIT_WINDOW_MS', env.RATE_LIMIT_WINDOW_MS) ?? 60_000,
    max,
  }
}

export function readExposureLimits(
  env: NodeJS.ProcessEnv = process.env,
): ExposureLimits | undefined {
  const perBuyer = atomic('EXPOSURE_LIMIT_PER_BUYER', env.EXPOSURE_LIMIT_PER_BUYER)
  const perSeller = atomic('EXPOSURE_LIMIT_PER_SELLER', env.EXPOSURE_LIMIT_PER_SELLER)
  if (perBuyer === undefined && perSeller === undefined) return undefined
  return {
    ...(perBuyer === undefined ? {} : { perBuyer }),
    ...(perSeller === undefined ? {} : { perSeller }),
  }
}
