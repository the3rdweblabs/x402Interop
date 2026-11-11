// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  familyForNetwork,
  normalizeNetwork,
  type DeliveryMode,
  type Network,
} from '@x402interop/core'
import type { DepositType, SwapType } from '@x402interop/intents'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'

import { resolveCanaryAsset, type CanaryAsset } from './assets.js'

/** The only confirmation token accepted before real funds move. */
export const SEND_CONFIRMATION = 'send-mainnet'

const optionalString = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.string().optional(),
)

const envSchema = z.object({
  CANARY_ORIGIN_NETWORK: z.string().min(1),
  CANARY_DEST_NETWORK: z.string().min(1),
  CANARY_ORIGIN_ASSET: optionalString,
  CANARY_DEST_ASSET: optionalString,
  CANARY_AMOUNT: z.string().regex(/^\d+$/, 'CANARY_AMOUNT must be an atomic integer string'),
  CANARY_SWAP_TYPE: optionalString,
  CANARY_DEPOSIT_TYPE: optionalString,
  CANARY_DELIVERY_MODE: optionalString,
  CANARY_SLIPPAGE_BPS: optionalString,
  CANARY_ORIGIN_ADDRESS: optionalString,
  CANARY_DEST_ADDRESS: z.string().min(1),
  CANARY_ORIGIN_PRIVATE_KEY: optionalString,
  CANARY_ORIGIN_RPC_URL: optionalString,
  CANARY_SEND: optionalString,
  CANARY_WAIT: optionalString,
  CANARY_CONFIRM: optionalString,
  CANARY_POLL_INTERVAL_SECONDS: optionalString,
  CANARY_POLL_TIMEOUT_SECONDS: optionalString,
  CANARY_ONECLICK_BASE_URL: optionalString,
  CANARY_QUOTE_DRY: optionalString,
  CANARY_RESOURCE_URL: optionalString,
  ONECLICK_API_KEY: optionalString,
})

export interface CanaryConfig {
  originNetwork: Network
  destinationNetwork: Network
  originAsset: CanaryAsset
  destinationAsset: CanaryAsset
  /** Exact output amount on the destination chain, in atomic units. */
  amount: string
  swapType: SwapType
  depositType: DepositType
  deliveryMode: DeliveryMode
  /** Slippage tolerance sent to 1Click, in basis points. */
  slippageBps: number
  /** Buyer address on the origin chain, used as `refundTo`. */
  originAddress: string
  destinationAddress: string
  privateKey?: `0x${string}`
  originRpcUrl?: string
  /** Send the origin payment automatically. Defaults to false. */
  send: boolean
  /** Poll 1Click until a terminal state. Defaults to the value of `send`. */
  wait: boolean
  /** Ask 1Click for pricing only. No deposit address is created. */
  quoteDry: boolean
  pollIntervalMs: number
  pollTimeoutMs: number
  oneClickBaseUrl: string
  oneClickApiKey?: string
  resourceUrl: string
}

export interface CanaryOverrides {
  send?: boolean
  wait?: boolean
  quoteDry?: boolean
}

function enumValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T {
  if (value === undefined) return fallback
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')}`)
  }
  return value as T
}

function booleanValue(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be true or false`)
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function basisPoints(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error(`${name} must be an integer between 0 and 10000`)
  }
  return parsed
}

function urlValue(value: string | undefined, fallback: string, name: string): string {
  if (value === undefined) return fallback
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol')
    return value
  } catch {
    throw new Error(`${name} must be a valid http(s) URL`)
  }
}

/**
 * Read the canary environment. Nothing here contacts a network. Live sending
 * stays opt-in: it needs both `CANARY_SEND=true` and `CANARY_CONFIRM=send-mainnet`.
 */
export function readCanaryConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: CanaryOverrides = {},
): CanaryConfig {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid canary environment: ${detail}`)
  }
  const raw = parsed.data

  const originNetwork = normalizeNetwork(raw.CANARY_ORIGIN_NETWORK)
  const destinationNetwork = normalizeNetwork(raw.CANARY_DEST_NETWORK)
  const originAsset = resolveCanaryAsset(originNetwork, raw.CANARY_ORIGIN_ASSET)
  const destinationAsset = resolveCanaryAsset(destinationNetwork, raw.CANARY_DEST_ASSET)

  const privateKey = normalizePrivateKey(raw.CANARY_ORIGIN_PRIVATE_KEY)
  const originFamily = familyForNetwork(originNetwork)
  if (privateKey && originFamily !== 'evm') {
    throw new Error(
      `CANARY_ORIGIN_PRIVATE_KEY is an EVM key; ${originNetwork} is a ${originFamily ?? 'unknown'} origin. Leave the key empty and pay the deposit address from your own wallet.`,
    )
  }

  const account = privateKey ? privateKeyToAccount(privateKey) : undefined
  if (
    account &&
    raw.CANARY_ORIGIN_ADDRESS &&
    raw.CANARY_ORIGIN_ADDRESS.toLowerCase() !== account.address.toLowerCase()
  ) {
    throw new Error('CANARY_ORIGIN_ADDRESS does not match CANARY_ORIGIN_PRIVATE_KEY')
  }
  const originAddress = raw.CANARY_ORIGIN_ADDRESS ?? account?.address
  if (!originAddress) {
    throw new Error('Set CANARY_ORIGIN_ADDRESS or CANARY_ORIGIN_PRIVATE_KEY (used as refundTo)')
  }

  const send = overrides.send ?? booleanValue(raw.CANARY_SEND, false, 'CANARY_SEND')
  const quoteDry =
    overrides.quoteDry ?? booleanValue(raw.CANARY_QUOTE_DRY, false, 'CANARY_QUOTE_DRY')
  const wait = overrides.wait ?? booleanValue(raw.CANARY_WAIT, send, 'CANARY_WAIT')
  const slippageBps = basisPoints(raw.CANARY_SLIPPAGE_BPS, 100, 'CANARY_SLIPPAGE_BPS')

  if (send && raw.CANARY_CONFIRM !== SEND_CONFIRMATION) {
    throw new Error(
      `CANARY_SEND=true requires CANARY_CONFIRM=${SEND_CONFIRMATION}. Show the amount and refund address to the user first.`,
    )
  }
  if (send && quoteDry) {
    throw new Error('CANARY_SEND=true cannot be combined with CANARY_QUOTE_DRY=true')
  }
  if (send && originFamily !== 'evm') {
    throw new Error(
      `Automatic sending is implemented for EVM origins only. ${originNetwork} is ${originFamily ?? 'unknown'}; set CANARY_SEND=false and pay manually.`,
    )
  }
  if (send && !privateKey) {
    throw new Error('CANARY_SEND=true requires CANARY_ORIGIN_PRIVATE_KEY')
  }

  return {
    originNetwork,
    destinationNetwork,
    originAsset,
    destinationAsset,
    amount: raw.CANARY_AMOUNT,
    swapType: enumValue<SwapType>(
      raw.CANARY_SWAP_TYPE,
      ['EXACT_INPUT', 'EXACT_OUTPUT'],
      'EXACT_OUTPUT',
      'CANARY_SWAP_TYPE',
    ),
    depositType: enumValue<DepositType>(
      raw.CANARY_DEPOSIT_TYPE,
      ['ORIGIN_CHAIN', 'INTENTS'],
      'ORIGIN_CHAIN',
      'CANARY_DEPOSIT_TYPE',
    ),
    deliveryMode: enumValue<DeliveryMode>(
      raw.CANARY_DELIVERY_MODE,
      ['on_deposit', 'on_success', 'pending_push'],
      'on_deposit',
      'CANARY_DELIVERY_MODE',
    ),
    slippageBps,
    originAddress,
    destinationAddress: raw.CANARY_DEST_ADDRESS,
    ...(privateKey ? { privateKey } : {}),
    ...(raw.CANARY_ORIGIN_RPC_URL ? { originRpcUrl: raw.CANARY_ORIGIN_RPC_URL } : {}),
    send,
    wait,
    quoteDry,
    pollIntervalMs:
      positiveInteger(raw.CANARY_POLL_INTERVAL_SECONDS, 10, 'CANARY_POLL_INTERVAL_SECONDS') * 1000,
    pollTimeoutMs:
      positiveInteger(raw.CANARY_POLL_TIMEOUT_SECONDS, 600, 'CANARY_POLL_TIMEOUT_SECONDS') * 1000,
    oneClickBaseUrl: urlValue(
      raw.CANARY_ONECLICK_BASE_URL,
      'https://1click.chaindefuser.com',
      'CANARY_ONECLICK_BASE_URL',
    ),
    ...(raw.ONECLICK_API_KEY ? { oneClickApiKey: raw.ONECLICK_API_KEY } : {}),
    resourceUrl: urlValue(
      raw.CANARY_RESOURCE_URL,
      'https://example.invalid/x402interop/canary',
      'CANARY_RESOURCE_URL',
    ),
  }
}

function normalizePrivateKey(value: string | undefined): `0x${string}` | undefined {
  if (value === undefined) return undefined
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('CANARY_ORIGIN_PRIVATE_KEY must be a 32-byte 0x-prefixed hex string')
  }
  return value as `0x${string}`
}
