// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { z } from 'zod'

export const MODES = ['live', 'test'] as const
export type AgentMode = (typeof MODES)[number]

const emptyToUndefined = z
  .string()
  .optional()
  .transform((v) => (v == null || v.trim() === '' ? undefined : v))

const schema = z.object({
  MODE: z.enum(MODES).default('test'),
  RESOURCE_BASE_URL: z.string().url().default('http://127.0.0.1:4040'),
  OPENAI_API_KEY: emptyToUndefined,
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().min(1).default('gpt-4.1-mini'),
  OPENAI_ORG: emptyToUndefined,
  OPENAI_PROJECT: emptyToUndefined,
  OPENAI_TEMPERATURE: z.coerce.number().default(0),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  ORIGIN_FAMILY: z.string().min(1).default('evm'),
  ORIGIN_NETWORK: z.string().min(1).default('eip155:8453'),
  ORIGIN_ASSET: z.string().min(1).default('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'),
  ORIGIN_ASSET_ID: z
    .string()
    .min(1)
    .default('nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near'),
  ORIGIN_PRIVATE_KEY: emptyToUndefined,
  ORIGIN_RPC_URL: emptyToUndefined,
  ORIGIN_ADDRESS: emptyToUndefined,
  CONFIRM_SPEND: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1' || v === 'yes'),
  MAX_SPEND_ATOMIC: z.string().regex(/^\d+$/).default('500000'),
})

export type AgentConfig = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    throw new Error(
      `Invalid agent configuration: ${parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`,
    )
  }
  if (parsed.data.MODE === 'live' && !parsed.data.ORIGIN_PRIVATE_KEY) {
    throw new Error('ORIGIN_PRIVATE_KEY is required when MODE=live')
  }
  return parsed.data
}
