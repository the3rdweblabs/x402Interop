// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { randomUUID } from 'node:crypto'

import {
  familyForNetwork,
  normalizeNetwork,
  SCHEME_IDS,
  type Network,
  type PaymentRequired,
  type X402InteropQuoteInfo,
} from '@x402interop/core'
import {
  mintQuote,
  quoteToRequirements,
  type OneClickClient,
  type OneClickStatus,
  type OneClickSwapStatus,
  type PreparedQuote,
  type QuoteRequest,
} from '@x402interop/intents'
import { paymentRequiredFromRequirement } from '@x402interop/servers'

import type { CanaryConfig } from './config.js'
import type { PayerInput, PayerResult } from './evm-payer.js'
export const TERMINAL_SWAP_STATUSES: readonly OneClickSwapStatus[] = [
  'SUCCESS',
  'REFUNDED',
  'FAILED',
  'INCOMPLETE_DEPOSIT',
]

export function isTerminalSwapStatus(status: OneClickSwapStatus): boolean {
  return TERMINAL_SWAP_STATUSES.includes(status)
}

/** Scheme id for the buyer's origin chain family. */
export function schemeForNetwork(network: Network): string {
  const family = familyForNetwork(normalizeNetwork(network))
  return family ? SCHEME_IDS[family] : SCHEME_IDS.evm
}

/** Product-facing label for a raw 1Click status. */
export function swapStateLabel(status: OneClickSwapStatus): string {
  switch (status) {
    case 'PENDING_DEPOSIT':
      return 'waiting for the origin deposit'
    case 'KNOWN_DEPOSIT_TX':
      return 'deposit seen, waiting for confirmation'
    case 'PROCESSING':
      return 'swap in flight'
    case 'SUCCESS':
      return 'settled'
    case 'INCOMPLETE_DEPOSIT':
      return 'deposit was incomplete'
    case 'REFUNDED':
      return 'refunded to the origin address'
    case 'FAILED':
      return 'failed'
    default:
      return String(status)
  }
}

export function encodePaymentRequiredHeader(body: PaymentRequired): string {
  return Buffer.from(JSON.stringify(body)).toString('base64')
}

export interface CanaryDeps {
  client: OneClickClient
  /** Only called when `config.send` is true. */
  payer?: (input: PayerInput) => Promise<PayerResult>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (line: string) => void
}

export interface CanaryResult {
  quote: X402InteropQuoteInfo
  prepared: PreparedQuote
  paymentRequired?: PaymentRequired
  originTxHash?: string
  paymentPayload?: unknown
  finalStatus: OneClickSwapStatus
  receipt?: OneClickStatus
  timedOut: boolean
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Mint a quote for any configured corridor, optionally send the origin leg,
 * and poll 1Click to a terminal state. The caller supplies the client and the
 * payer so this never reaches a network in tests.
 */
export async function runCanary(config: CanaryConfig, deps: CanaryDeps): Promise<CanaryResult> {
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? (() => Date.now())
  const log = deps.log ?? (() => {})

  const request: QuoteRequest = {
    sellerNetwork: config.destinationNetwork,
    sellerAsset: config.destinationAsset.asset,
    sellerAssetId: config.destinationAsset.intentsAssetId,
    sellerAddress: config.destinationAddress,
    amount: config.amount,
    buyerNetwork: config.originNetwork,
    buyerAsset: config.originAsset.asset,
    buyerAssetId: config.originAsset.intentsAssetId,
    buyerAddress: config.originAddress,
    deliveryMode: config.deliveryMode,
    depositType: config.depositType,
    swapType: config.swapType,
  }

  const quote = await mintQuote(request, deps.client, {
    dry: config.quoteDry,
    slippageBps: config.slippageBps,
  })
  const prepared = quoteToRequirements(request, quote, schemeForNetwork(config.originNetwork))
  const paymentRequired = config.quoteDry
    ? undefined
    : paymentRequiredFromRequirement(prepared.requirements, {
        resource: {
          url: config.resourceUrl,
          description: 'x402Interop live canary resource',
          mimeType: 'application/json',
        },
        extensions: prepared.extensions as unknown as Record<string, unknown>,
      })

  log(
    `quote ${quote.quoteId}: pay ${quote.originAmount} on ${config.originNetwork}, receive ${quote.destinationAmount} on ${config.destinationNetwork}; deposit ${quote.depositAddress} (expires ${quote.expiresAt})`,
  )
  if (quote.depositMemo) log(`deposit memo/tag: ${quote.depositMemo}`)

  let originTxHash: string | undefined
  let paymentPayload: unknown

  if (config.send) {
    if (!config.privateKey) {
      throw new Error('CANARY_ORIGIN_PRIVATE_KEY is required when CANARY_SEND=true')
    }
    if (!deps.payer) {
      throw new Error('No origin payer is configured for this canary')
    }
    if (quote.depositAddress.length === 0) {
      throw new Error('The quote has no deposit address; refusing to send')
    }
    const payment = await deps.payer({
      privateKey: config.privateKey,
      originNetwork: config.originNetwork,
      ...(config.originRpcUrl ? { rpcUrl: config.originRpcUrl } : {}),
      asset: config.originAsset,
      amount: quote.originAmount,
      depositAddress: quote.depositAddress,
      quoteId: quote.quoteId,
      nonce: randomUUID(),
      expiresAt: quote.expiresAt,
      requirements: prepared.requirements,
    })
    originTxHash = payment.txHash
    paymentPayload = payment.paymentPayload
    log(`origin transfer confirmed: ${payment.txHash}`)
  }

  if (!config.wait || quote.depositAddress.length === 0) {
    return {
      quote,
      prepared,
      ...(paymentRequired ? { paymentRequired } : {}),
      ...(originTxHash ? { originTxHash } : {}),
      ...(paymentPayload !== undefined ? { paymentPayload } : {}),
      finalStatus: 'PENDING_DEPOSIT',
      timedOut: false,
    }
  }

  const deadline = now() + config.pollTimeoutMs
  let last: OneClickStatus = {
    status: 'PENDING_DEPOSIT',
    depositAddress: quote.depositAddress,
  }
  let lastLabel = ''

  while (now() < deadline) {
    last = await deps.client.status(quote.depositAddress, quote.depositMemo)
    const label = swapStateLabel(last.status)
    if (label !== lastLabel) {
      log(`status ${last.status}: ${label}`)
      lastLabel = label
    }
    if (isTerminalSwapStatus(last.status)) {
      return {
        quote,
        prepared,
        ...(paymentRequired ? { paymentRequired } : {}),
        ...(originTxHash ? { originTxHash } : {}),
        ...(paymentPayload !== undefined ? { paymentPayload } : {}),
        finalStatus: last.status,
        receipt: last,
        timedOut: false,
      }
    }
    await sleep(config.pollIntervalMs)
  }

  return {
    quote,
    prepared,
    ...(paymentRequired ? { paymentRequired } : {}),
    ...(originTxHash ? { originTxHash } : {}),
    ...(paymentPayload !== undefined ? { paymentPayload } : {}),
    finalStatus: last.status,
    receipt: last,
    timedOut: true,
  }
}
