// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createWalletClient, http, parseEther, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

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
    })
  } else {
    // Native transfer
    txHash = await client.sendTransaction({
      to: params.depositAddress,
      value: BigInt(params.amount),
    })
  }

  const binding = {
    quoteId: params.quoteId,
    depositAddress: params.depositAddress,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  }

  const paymentPayload = {
    x402Version: 2,
    payload: {
      authorization: {
        from: account.address,
        to: params.depositAddress,
        value: params.amount,
        txHash,
      },
      binding,
    },
  }

  return { txHash, paymentPayload, binding }
}
