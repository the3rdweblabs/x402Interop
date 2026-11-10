// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import {
  INTEROP_EIP712_DOMAIN_NAME,
  INTEROP_EIP712_DOMAIN_VERSION,
  INTEROP_EIP712_PRIMARY_TYPE,
  INTEROP_EIP712_TYPES,
  evmChainIdFromNetwork,
  interopEvmTypedData,
} from '../src/proof.js'

const message = {
  quoteId: 'quote-1',
  depositAddress: `0x${'11'.repeat(20)}` as `0x${string}`,
  originNetwork: 'eip155:8453',
  originAsset: `0x${'22'.repeat(20)}`,
  originAmount: 222270n,
  nonce: 'nonce-1',
  expiresAt: '2026-11-03T12:30:00.000Z',
}

describe('interopEvmTypedData', () => {
  it('builds the shared EIP-712 domain, types, and message', () => {
    const typed = interopEvmTypedData(message, 8453)

    expect(typed).toEqual({
      domain: {
        name: 'x402Interop',
        version: '1',
        chainId: 8453,
      },
      types: INTEROP_EIP712_TYPES,
      primaryType: 'InteropPayment',
      message,
    })
    expect(INTEROP_EIP712_DOMAIN_NAME).toBe('x402Interop')
    expect(INTEROP_EIP712_DOMAIN_VERSION).toBe('1')
    expect(INTEROP_EIP712_PRIMARY_TYPE).toBe('InteropPayment')
  })

  it('binds every term the seller verifies', () => {
    const names = INTEROP_EIP712_TYPES.InteropPayment.map((field) => field.name)

    expect(names).toEqual([
      'quoteId',
      'depositAddress',
      'originNetwork',
      'originAsset',
      'originAmount',
      'nonce',
      'expiresAt',
    ])
  })
})

describe('evmChainIdFromNetwork', () => {
  it('reads the chain id from an eip155 network id', () => {
    expect(evmChainIdFromNetwork('eip155:8453')).toBe(8453)
    expect(evmChainIdFromNetwork('eip155:1')).toBe(1)
  })

  it('returns undefined for non-EVM and malformed ids', () => {
    expect(evmChainIdFromNetwork('sui:mainnet')).toBeUndefined()
    expect(evmChainIdFromNetwork('base')).toBeUndefined()
    expect(evmChainIdFromNetwork('eip155')).toBeUndefined()
    expect(evmChainIdFromNetwork('eip155:')).toBeUndefined()
    expect(evmChainIdFromNetwork('eip155:base')).toBeUndefined()
  })
})
