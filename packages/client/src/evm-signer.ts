// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createWalletClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

export interface EvmPaymentParams {
  privateKey: `0x${string}`
  depositAddress: string
  amount: string // in smallest units
  tokenAddress?: string // for ERC20
  chain?: any
  rpcUrl?: string
}

/**
 * Build a payment payload for EVM x402interop payments
 * This creates a transfer to the deposit address with binding info
 */
export async function buildEvmPaymentPayload(params: EvmPaymentParams, binding: any) {
  const account = privateKeyToAccount(params.privateKey)
  const chain = params.chain || base
  const client = createWalletClient({
    account,
    chain,
    transport: http(params.rpcUrl),
  })

  // For native transfers or ERC20 transfers to deposit address
  // The actual signature/authorization depends on scheme requirements
  const payload = {
    from: account.address,
    to: params.depositAddress,
    value: params.tokenAddress ? '0' : params.amount,
    token: params.tokenAddress,
    amount: params.amount,
    binding,
    signature: null, // To be filled by specific scheme (EIP-3009 etc)
  }

  return {
    x402Version: 2,
    payload: {
      authorization: payload,
      binding,
    },
  }
}
