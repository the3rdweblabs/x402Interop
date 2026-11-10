// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { randomBytes, randomUUID } from 'node:crypto'

import { buildEvmPaymentPayload, sendEvmPayment } from '@x402interop/client'
import { privateKeyToAccount } from 'viem/accounts'

import type { AgentConfig } from './config.js'

export interface PaymentRequirementLike {
  scheme: string
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds?: number
  extra?: Record<string, unknown>
}

export interface SourceOrigin {
  family: string
  network: string
  asset: string
  assetId: string
  address: string
}

export interface PayResult {
  mode: 'test' | 'live'
  txHash: string
  paymentPayload: unknown
  binding: unknown
  origin: SourceOrigin
  amount: string
  depositAddress: string
}

export interface SourcePayer {
  readonly family: string
  origin(): SourceOrigin
  pay(requirement: PaymentRequirementLike, config: AgentConfig): Promise<PayResult>
}

function evmPrivateKey(config: AgentConfig): `0x${string}` {
  if (config.ORIGIN_PRIVATE_KEY) return config.ORIGIN_PRIVATE_KEY as `0x${string}`
  // test-mode throwaway key: deterministic enough for local runs? random is fine.
  return `0x${randomBytes(32).toString('hex')}` as `0x${string}`
}

export function createEvmPayer(config: AgentConfig): SourcePayer {
  const privateKey = evmPrivateKey(config)
  const address = config.ORIGIN_ADDRESS ?? privateKeyToAccount(privateKey).address
  return {
    family: 'evm',
    origin() {
      return {
        family: 'evm',
        network: config.ORIGIN_NETWORK,
        asset: config.ORIGIN_ASSET,
        assetId: config.ORIGIN_ASSET_ID,
        address,
      }
    },
    async pay(requirement, cfg) {
      const extra = (requirement.extra ?? {}) as Record<string, string>
      const originAmount = String(extra.originAmount ?? requirement.amount)
      if (BigInt(originAmount) > BigInt(cfg.MAX_SPEND_ATOMIC)) {
        throw new Error(
          `Spend ${originAmount} exceeds MAX_SPEND_ATOMIC=${cfg.MAX_SPEND_ATOMIC}; refusing to pay`,
        )
      }
      const binding = {
        quoteId: String(extra.quoteId ?? ''),
        depositAddress: String(extra.depositAddress ?? requirement.payTo),
        nonce: randomUUID(),
        expiresAt: String(extra.expiresAt ?? new Date(Date.now() + 300_000).toISOString()),
        originNetwork: cfg.ORIGIN_NETWORK,
        originAsset: cfg.ORIGIN_ASSET,
        originAmount,
      }
      if (!binding.quoteId || !binding.depositAddress) {
        throw new Error('Requirement is missing quote binding (quoteId/depositAddress)')
      }

      if (cfg.MODE === 'test') {
        const txHash = `0x${randomBytes(32).toString('hex')}` as `0x${string}`
        const signed = await buildEvmPaymentPayload(
          {
            privateKey,
            depositAddress: binding.depositAddress,
            amount: originAmount,
            originNetwork: cfg.ORIGIN_NETWORK,
            originAsset: cfg.ORIGIN_ASSET,
            originAmount,
            txHash,
          },
          binding,
        )
        return {
          mode: 'test',
          txHash,
          paymentPayload: signed,
          binding: signed.payload.binding,
          origin: this.origin(),
          amount: originAmount,
          depositAddress: binding.depositAddress,
        }
      }

      if (cfg.MODE === 'live' && !cfg.CONFIRM_SPEND) {
        throw new Error(
          'MODE=live requires CONFIRM_SPEND=true before broadcasting a real mainnet transaction',
        )
      }
      const sent = await sendEvmPayment({
        privateKey,
        ...(cfg.ORIGIN_RPC_URL ? { rpcUrl: cfg.ORIGIN_RPC_URL } : {}),
        depositAddress: binding.depositAddress as `0x${string}`,
        tokenAddress: cfg.ORIGIN_ASSET as `0x${string}`,
        amount: originAmount,
        originNetwork: cfg.ORIGIN_NETWORK,
        originAsset: cfg.ORIGIN_ASSET,
        originAmount,
        quoteId: binding.quoteId,
        nonce: binding.nonce,
        expiresAt: binding.expiresAt,
      })
      return {
        mode: 'live',
        txHash: sent.txHash,
        paymentPayload: sent.paymentPayload,
        binding: sent.binding,
        origin: this.origin(),
        amount: originAmount,
        depositAddress: binding.depositAddress,
      }
    },
  }
}

export function createSourcePayer(config: AgentConfig): SourcePayer {
  if (config.ORIGIN_FAMILY === 'evm') return createEvmPayer(config)
  throw new Error(
    `Origin family '${config.ORIGIN_FAMILY}' is not implemented in this example yet. ` +
      `EVM origin is supported now; Sui/NEAR/SVM source wallets can be added via the SourcePayer interface.`,
  )
}
