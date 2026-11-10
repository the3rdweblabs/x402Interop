// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { PaymentRequirements } from '@x402interop/core'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

import { buildEvmPaymentPayload } from './evm-signer.js'

export interface SendPaymentParams {
  privateKey: `0x${string}`
  depositAddress: `0x${string}`
  amount: string
  tokenAddress?: `0x${string}`
  chain?: any
  rpcUrl?: string
  quoteId: string
  nonce: string
  expiresAt: string
  /** Requirements from the seller's 402, echoed back in the retry payload. */
  accepted?: PaymentRequirements
  originNetwork?: string
  originAsset?: string
  originAmount?: string
}

export async function sendEvmPayment(params: SendPaymentParams) {
  const account = privateKeyToAccount(params.privateKey)
  const chain = params.chain || base
  const client = createWalletClient({
    account,
    chain,
    transport: http(params.rpcUrl || 'https://mainnet.base.org'),
  })

  let txHash: `0x${string}`
  if (params.tokenAddress) {
    // ERC20 transfer
    const { encodeFunctionData } = await import('viem')
    const data = encodeFunctionData({
      abi: [
        {
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'transfer',
      args: [params.depositAddress, BigInt(params.amount)],
    })
    txHash = await client.sendTransaction({
      to: params.tokenAddress,
      data,
      chain,
    })
  } else {
    // Native transfer
    txHash = await client.sendTransaction({
      to: params.depositAddress,
      value: BigInt(params.amount),
      chain,
    })
  }

  const binding = {
    quoteId: params.quoteId,
    depositAddress: params.depositAddress,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
    originNetwork: params.originNetwork ?? `eip155:${chain.id}`,
    originAsset: params.originAsset ?? params.tokenAddress ?? 'native',
    originAmount: params.originAmount ?? params.amount,
  }

  const signed = await buildEvmPaymentPayload(
    {
      privateKey: params.privateKey,
      depositAddress: params.depositAddress,
      amount: params.amount,
      ...(params.tokenAddress ? { tokenAddress: params.tokenAddress } : {}),
      chain,
      ...(params.rpcUrl ? { rpcUrl: params.rpcUrl } : {}),
      originNetwork: binding.originNetwork,
      originAsset: binding.originAsset,
      originAmount: binding.originAmount,
      txHash,
    },
    binding,
  )

  const paymentPayload = {
    ...signed,
    ...(params.accepted ? { accepted: params.accepted } : {}),
  }

  return { txHash, paymentPayload, binding }
}
