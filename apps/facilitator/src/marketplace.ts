// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { z } from 'zod'

import type { ListingFeeOption, MarketplaceFeeConfig } from '@x402interop/facilkit'

const feeOptionSchema = z.object({
  network: z.string().min(1),
  asset: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  treasury: z.string().min(1),
  decimals: z.number().int().nonnegative().optional(),
  symbol: z.string().min(1).optional(),
})

const feeConfigSchema = z.object({
  registration: z.array(feeOptionSchema),
  featured: z.object({
    '30d': z.array(feeOptionSchema),
    '60d': z.array(feeOptionSchema),
  }),
})

export interface MarketplaceEnvironment {
  fees?: MarketplaceFeeConfig
  freeListings: boolean
  apiKeys: Record<string, string>
  domain: string
}

function parseApiKeys(raw: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf('=')
    if (separator <= 0 || separator === entry.length - 1) {
      throw new Error('X402INTEROP_API_KEYS must contain comma-separated key=owner entries')
    }
    result[entry.slice(0, separator)] = entry.slice(separator + 1)
  }
  return result
}

function parseJson<T>(
  name: string,
  value: string | undefined,
  schema: z.ZodType<T>,
): T | undefined {
  if (!value) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${name} must contain valid JSON`)
  }
  return schema.parse(parsed)
}

/**
 * Host shown in sign-in messages. Production must name it explicitly, so a
 * wallet never signs a message that says "localhost".
 */
function marketplaceDomain(env: NodeJS.ProcessEnv): string {
  const configured = (env.MARKETPLACE_DOMAIN ?? '').trim()
  if (configured) return configured
  if (env.NODE_ENV === 'production') {
    throw new Error('MARKETPLACE_DOMAIN must be set in production, for example x402interop.xyz')
  }
  return 'localhost:4321'
}

/**
 * Marketplace backend configuration, owned by the facilitator app. The
 * marketplace UI is static; this process enforces fees and authenticates
 * listing writes.
 */
export function readMarketplaceEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): MarketplaceEnvironment {
  const fees = parseJson('MARKETPLACE_FEES_JSON', env.MARKETPLACE_FEES_JSON, feeConfigSchema) as
    MarketplaceFeeConfig | undefined
  const freeListings = ['1', 'true', 'yes'].includes(
    (env.MARKETPLACE_FREE_LISTINGS ?? '').trim().toLowerCase(),
  )
  if (freeListings && fees) {
    throw new Error('Set either MARKETPLACE_FEES_JSON or MARKETPLACE_FREE_LISTINGS=true, not both')
  }
  return {
    fees: fees
      ? {
          registration: fees.registration as ListingFeeOption[],
          featured: fees.featured,
        }
      : undefined,
    freeListings,
    apiKeys: parseApiKeys(env.X402INTEROP_API_KEYS),
    domain: marketplaceDomain(env),
  }
}
