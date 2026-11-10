// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * EIP-712 proof carried by an EVM-origin x402interop payload. The on-chain
 * transfer is the payment; this signature binds the buyer to the exact quote,
 * deposit address, origin amount, nonce, and expiry the seller quoted.
 *
 * The typed-data shape is shared by the client signer and the seller verifier
 * so both sides hash exactly the same message.
 */

export const INTEROP_EIP712_DOMAIN_NAME = 'x402Interop'
export const INTEROP_EIP712_DOMAIN_VERSION = '1'
export const INTEROP_EIP712_PRIMARY_TYPE = 'InteropPayment'

export interface InteropEvmBindingMessage {
  quoteId: string
  depositAddress: `0x${string}`
  originNetwork: string
  originAsset: string
  originAmount: bigint
  nonce: string
  expiresAt: string
}

export const INTEROP_EIP712_TYPES = {
  InteropPayment: [
    { name: 'quoteId', type: 'string' },
    { name: 'depositAddress', type: 'address' },
    { name: 'originNetwork', type: 'string' },
    { name: 'originAsset', type: 'string' },
    { name: 'originAmount', type: 'uint256' },
    { name: 'nonce', type: 'string' },
    { name: 'expiresAt', type: 'string' },
  ],
} as const

export interface InteropEvmTypedData {
  domain: {
    name: string
    version: string
    chainId: number
  }
  types: typeof INTEROP_EIP712_TYPES
  primaryType: typeof INTEROP_EIP712_PRIMARY_TYPE
  message: InteropEvmBindingMessage
}

/** Build the exact EIP-712 object both sides sign or recover. */
export function interopEvmTypedData(
  message: InteropEvmBindingMessage,
  chainId: number,
): InteropEvmTypedData {
  return {
    domain: {
      name: INTEROP_EIP712_DOMAIN_NAME,
      version: INTEROP_EIP712_DOMAIN_VERSION,
      chainId,
    },
    types: INTEROP_EIP712_TYPES,
    primaryType: INTEROP_EIP712_PRIMARY_TYPE,
    message,
  }
}

/** Parse the chain id from a CAIP-2 `eip155:<id>` network id. */
export function evmChainIdFromNetwork(network: string): number | undefined {
  const [namespace, id] = network.split(':')
  if (namespace !== 'eip155' || id === undefined || !/^\d+$/.test(id)) return undefined
  return Number(id)
}
