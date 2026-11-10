// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { z } from 'zod'

export const MODES = ['live', 'test'] as const
export type ResourceMode = (typeof MODES)[number]

const emptyToUndefined = z
  .string()
  .optional()
  .transform((v) => (v == null || v.trim() === '' ? undefined : v))

const envSchema = z.object({
  MODE: z.enum(MODES).default('test'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4040),
  ONECLICK_API_KEY: emptyToUndefined,
  ONE_CLICK_API_URL: z.string().url().default('https://1click.chaindefuser.com'),
  SUI_SELLER_ADDRESS: z.string().min(1),
  NEAR_SELLER_ADDRESS: z.string().min(1),
  SUI_USDC_AMOUNT: z.string().regex(/^\d+$/).default('150000'),
  NEAR_USDC_AMOUNT: z.string().regex(/^\d+$/).default('150000'),
  DEFAULT_BUYER_NETWORK: z.string().min(1).default('eip155:8453'),
  DEFAULT_BUYER_ASSET: z.string().min(1).default('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'),
  DEFAULT_BUYER_ASSET_ID: z
    .string()
    .min(1)
    .default('nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near'),
  DEFAULT_BUYER_ADDRESS: z.string().min(1).default('0x0000000000000000000000000000000000000000'),
  PAYMENT_REQUIRED_BODY: z.enum(['auto', 'empty', 'json', 'error']).default('auto'),
})

export type ResourceConfig = z.infer<typeof envSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ResourceConfig {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid resource service configuration: ${message}`)
  }
  if (parsed.data.MODE === 'live' && !parsed.data.ONECLICK_API_KEY) {
    throw new Error('ONECLICK_API_KEY is required when MODE=live')
  }
  return parsed.data
}
