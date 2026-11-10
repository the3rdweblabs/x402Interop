// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { addressNetworkError, parseCaip10, shortenAddress, toCaip10 } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { chainReferenceFor, ownerOf, payToNetworkError } from '../src/wallet-auth.js'

const SUI_PAY_TO = `0x${'a'.repeat(64)}`
const EVM_PAY_TO = '0x930738786598C18B041B0B9201367580DC156C2A'
const SOLANA_PAY_TO = '4WtJNKpALxSauYPfnn9tR5kP3w6wog2Qqvx6LTsWAVcQ'

describe('owner ids are CAIP-10 identities', () => {
  it('namespaces by CAIP-2 and lowercases EVM and Sui', () => {
    expect(ownerOf('evm', EVM_PAY_TO, '8453')).toBe(`eip155:8453:${EVM_PAY_TO.toLowerCase()}`)
    expect(ownerOf('sui', SUI_PAY_TO, 'mainnet')).toBe(`sui:mainnet:${SUI_PAY_TO}`)
  })

  it('keeps Solana case and uses the genesis reference', () => {
    const genesis = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
    expect(ownerOf('solana', SOLANA_PAY_TO, genesis)).toBe(`solana:${genesis}:${SOLANA_PAY_TO}`)
  })

  it('resolves a reference from a reported network, with a family fallback', () => {
    expect(chainReferenceFor('evm', 'eip155:8453')).toBe('8453')
    expect(chainReferenceFor('evm')).toBe('1')
    expect(chainReferenceFor('sui')).toBe('mainnet')
    expect(chainReferenceFor('near')).toBe('mainnet')
  })

  it('round-trips through the CAIP-10 parser', () => {
    const owner = ownerOf('evm', EVM_PAY_TO, '8453')
    expect(parseCaip10(owner)).toEqual({
      namespace: 'eip155',
      reference: '8453',
      address: EVM_PAY_TO.toLowerCase(),
    })
    expect(parseCaip10('evm:0x1234')).toBeUndefined()
    expect(parseCaip10('0x930738786598C18B041B0B9201367580DC156C2A')).toBeUndefined()
    expect(toCaip10('eip155:8453', EVM_PAY_TO)).toBe(`eip155:8453:${EVM_PAY_TO}`)
  })
})

describe('payTo is validated against the listing network', () => {
  it('rejects an EVM payTo for a sui:mainnet listing', () => {
    expect(payToNetworkError(['sui:mainnet'], EVM_PAY_TO)).toBe(
      'sui:mainnet needs a 0x-prefixed 64-character hex address',
    )
  })

  it('accepts a Sui payTo for a sui:mainnet listing', () => {
    expect(payToNetworkError(['sui:mainnet'], SUI_PAY_TO)).toBeUndefined()
  })

  it('accepts an EVM payTo for an EVM listing', () => {
    expect(payToNetworkError(['eip155:8453'], EVM_PAY_TO)).toBeUndefined()
  })

  it('accepts a Solana payTo for a Solana listing', () => {
    expect(payToNetworkError(['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], SOLANA_PAY_TO)).toBeUndefined()
  })

  it('requires a payTo to be valid on every listed network', () => {
    expect(payToNetworkError(['eip155:8453', 'sui:mainnet'], EVM_PAY_TO)).toContain('sui:mainnet')
    expect(payToNetworkError([], EVM_PAY_TO)).toBe('A listing needs at least one network')
  })

  it('rejects an owner id presented as a payTo', () => {
    const owner = ownerOf('evm', EVM_PAY_TO, '8453')
    expect(addressNetworkError('sui:mainnet', owner)).toContain('sui:mainnet')
    expect(addressNetworkError('eip155:8453', owner)).toContain('eip155:8453')
  })
})

describe('display helpers', () => {
  it('shortens long values and leaves short ones alone', () => {
    expect(shortenAddress('0x930738786598c18b041b0b9201367580dc156c2a', 6, 4)).toBe('0x9307…6c2a')
    expect(shortenAddress('0x1234')).toBe('0x1234')
  })
})
