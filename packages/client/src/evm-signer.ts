// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  evmChainIdFromNetwork,
  interopEvmTypedData,
  type InteropEvmBindingMessage,
} from '@x402interop/core'
import { privateKeyToAccount } from 'viem/accounts'

export interface EvmPaymentParams {
  privateKey: `0x${string}`
  depositAddress: string
  /** Atomic amount moved on the origin chain. */
  amount: string
  /** ERC-20 contract on the origin chain; omitted for a native transfer. */
  tokenAddress?: string
  chain?: { id: number }
  rpcUrl?: string
  originNetwork?: string
  originAsset?: string
  originAmount?: string
  /** Set after the origin transaction is broadcast. */
  txHash?: string
}

export interface EvmPaymentBinding {
  quoteId: string
  depositAddress: string
  nonce: string
  expiresAt: string
  originNetwork?: string
  originAsset?: string
  originAmount?: string
}

/**
 * Build a signed x402interop payment payload for an EVM origin. The signature
 * is EIP-712 over the quote binding; the transfer itself is broadcast by
 * `sendEvmPayment`, which then adds the transaction hash.
 */
export async function buildEvmPaymentPayload(params: EvmPaymentParams, binding: EvmPaymentBinding) {
  const account = privateKeyToAccount(params.privateKey)
  const chainId =
    evmChainIdFromNetwork(binding.originNetwork ?? params.originNetwork ?? '') ??
    params.chain?.id ??
    8453
  const originNetwork = binding.originNetwork ?? params.originNetwork ?? `eip155:${chainId}`
  const originAsset = binding.originAsset ?? params.originAsset ?? params.tokenAddress ?? 'native'
  const originAmount = binding.originAmount ?? params.originAmount ?? params.amount
  if (!/^\d+$/.test(originAmount)) {
    throw new Error('originAmount must be an atomic integer string')
  }

  const message: InteropEvmBindingMessage = {
    quoteId: binding.quoteId,
    depositAddress: params.depositAddress as `0x${string}`,
    originNetwork,
    originAsset,
    originAmount: BigInt(originAmount),
    nonce: binding.nonce,
    expiresAt: binding.expiresAt,
  }
  const typedData = interopEvmTypedData(message, chainId)
  const signature = await account.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })

  const payload = {
    from: account.address,
    to: params.depositAddress,
    value: params.tokenAddress ? '0' : params.amount,
    token: params.tokenAddress,
    amount: params.amount,
    txHash: params.txHash ?? null,
    signature,
    originNetwork,
    originAsset,
    originAmount,
    nonce: binding.nonce,
    expiresAt: binding.expiresAt,
  }

  return {
    x402Version: 2,
    payload: {
      authorization: payload,
      binding: {
        ...binding,
        originNetwork,
        originAsset,
        originAmount,
      },
    },
  }
}
