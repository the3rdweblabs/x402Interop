// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { sendEvmPayment } from '@x402interop/client'
import type { PaymentRequirements } from '@x402interop/core'
import { createPublicClient, http, type Chain } from 'viem'
import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon, scroll } from 'viem/chains'

import type { CanaryAsset } from './assets.js'

export interface PayerInput {
  privateKey: `0x${string}`
  originNetwork: string
  rpcUrl?: string
  asset: CanaryAsset
  amount: string
  depositAddress: string
  quoteId: string
  nonce: string
  expiresAt: string
  requirements: PaymentRequirements
}

export interface PayerResult {
  txHash: `0x${string}`
  paymentPayload: unknown
}

const BUILT_IN_CHAINS: Record<number, Chain> = {
  1: mainnet,
  10: optimism,
  56: bsc,
  137: polygon,
  8453: base,
  42161: arbitrum,
  43114: avalanche,
  534352: scroll,
}

export function chainIdFor(network: string): number {
  const [namespace, id] = network.split(':')
  if (namespace !== 'eip155' || id === undefined || !/^\d+$/.test(id)) {
    throw new Error(`${network} is not an EVM network (expected eip155:<chainId>)`)
  }
  return Number(id)
}

/**
 * Resolve a viem chain for any CAIP-2 EVM network. Catalogue chains use their
 * built-in definition; an unknown chain needs an explicit RPC URL.
 */
export function evmChainFor(network: string, rpcUrl?: string): Chain {
  const id = chainIdFor(network)
  const builtIn = BUILT_IN_CHAINS[id]
  if (builtIn) return builtIn
  if (!rpcUrl) {
    throw new Error(`No built-in RPC for eip155:${id}. Set CANARY_ORIGIN_RPC_URL.`)
  }
  return {
    id,
    name: `eip155:${id}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  }
}

/** Send an ERC-20 or native transfer to the single-use deposit address. */
export async function payEvmOrigin(input: PayerInput): Promise<PayerResult> {
  const chain = evmChainFor(input.originNetwork, input.rpcUrl)
  const rpcUrl = input.rpcUrl ?? chain.rpcUrls.default.http[0]
  const tokenAddress = /^0x[0-9a-fA-F]{40}$/.test(input.asset.asset)
    ? (input.asset.asset as `0x${string}`)
    : undefined

  const result = await sendEvmPayment({
    privateKey: input.privateKey,
    depositAddress: input.depositAddress as `0x${string}`,
    amount: input.amount,
    ...(tokenAddress ? { tokenAddress } : {}),
    chain,
    ...(rpcUrl ? { rpcUrl } : {}),
    quoteId: input.quoteId,
    nonce: input.nonce,
    expiresAt: input.expiresAt,
    accepted: input.requirements,
    originNetwork: input.originNetwork,
    originAsset: tokenAddress ?? 'native',
    originAmount: input.amount,
  })

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: result.txHash })
  if (receipt.status !== 'success') {
    throw new Error(`Origin transaction ${result.txHash} reverted`)
  }

  return {
    txHash: result.txHash,
    paymentPayload: result.paymentPayload,
  }
}
