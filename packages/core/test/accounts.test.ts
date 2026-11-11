// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import {
  addressNetworkError,
  canValidateAddressForFamily,
  familyOfNetwork,
  isCaip10AccountForNetwork,
  parseCaip10,
  shortenAddress,
  toCaip10,
} from '../src/index.js'

const evm = `0x${'ab'.repeat(20)}`
const sui = `0x${'cd'.repeat(32)}`
const svm = '1'.repeat(32)
const near = 'seller.near'
const nearKey = `ed25519:${'1'.repeat(32)}`
const aptos = '0x1'
const starknet = '0xabc'
const ton = `EQ${'A'.repeat(46)}`
const tron = `T${'1'.repeat(33)}`
const xrpl = `r${'1'.repeat(25)}`
const stellar = `G${'A'.repeat(55)}`

describe('account addresses', () => {
  it('validates the families that have a shape check', () => {
    expect(canValidateAddressForFamily('evm')).toBe(true)
    expect(canValidateAddressForFamily('lightning')).toBe(false)
    expect(canValidateAddressForFamily('utxo')).toBe(false)

    expect(addressNetworkError('eip155:8453', evm)).toBeUndefined()
    expect(addressNetworkError('base', evm)).toBeUndefined()
    expect(addressNetworkError('sui:mainnet', sui)).toBeUndefined()
    expect(addressNetworkError('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', svm)).toBeUndefined()
    expect(addressNetworkError('near:mainnet', near)).toBeUndefined()
    expect(addressNetworkError('near:mainnet', nearKey)).toBeUndefined()
    expect(addressNetworkError('aptos:1', aptos)).toBeUndefined()
    expect(addressNetworkError('starknet:SN_MAIN', starknet)).toBeUndefined()
    expect(addressNetworkError('tvm:-239', ton)).toBeUndefined()
    expect(addressNetworkError('tron:728126428', tron)).toBeUndefined()
    expect(addressNetworkError('xrpl:0', xrpl)).toBeUndefined()
    expect(addressNetworkError('stellar:pubnet', stellar)).toBeUndefined()
  })

  it('rejects a malformed address and skips families with no check', () => {
    expect(addressNetworkError('eip155:8453', '0x123')).toMatch(/40-character hex/)
    expect(addressNetworkError('sui:mainnet', evm)).toMatch(/64-character hex/)
    expect(addressNetworkError('near:mainnet', 'not an account')).toMatch(/\.near account/)
    expect(addressNetworkError('unknown:1', evm)).toBe('Unknown network "unknown:1"')
    expect(addressNetworkError('lnbtc:000000000019d6689c085ae165831e93', 'lnbc1')).toBeUndefined()
    expect(addressNetworkError('bip122:000000000019d6689c085ae165831e93', 'bc1q')).toBeUndefined()
    expect(familyOfNetwork('base')).toBe('evm')
    expect(familyOfNetwork('unknown:1')).toBeUndefined()
  })

  it('parses and builds CAIP-10 account ids', () => {
    expect(parseCaip10(`eip155:8453:${evm}`)).toEqual({
      namespace: 'eip155',
      reference: '8453',
      address: evm,
    })
    expect(parseCaip10(evm)).toBeUndefined()
    expect(parseCaip10(`evm:${evm}`)).toBeUndefined()

    expect(toCaip10('eip155:8453', evm)).toBe(`eip155:8453:${evm}`)
    expect(toCaip10('base', evm)).toBe(`eip155:8453:${evm}`)
    expect(() => toCaip10('notaNetwork', evm)).toThrow(/not a CAIP-2 network id/)
  })

  it('accepts a CAIP-10 id only when the namespace and address agree', () => {
    expect(isCaip10AccountForNetwork(`eip155:8453:${evm}`, 'eip155:8453')).toBe(true)
    expect(isCaip10AccountForNetwork(`eip155:8453:${evm}`, 'base')).toBe(true)
    expect(isCaip10AccountForNetwork(`sui:mainnet:${sui}`, 'eip155:8453')).toBe(false)
    expect(isCaip10AccountForNetwork(`eip155:8453:0x123`, 'eip155:8453')).toBe(false)
    expect(isCaip10AccountForNetwork(evm, 'eip155:8453')).toBe(false)
    expect(
      isCaip10AccountForNetwork(
        'lnbtc:000000000019d6689c085ae165831e93:invoice',
        'lnbtc:000000000019d6689c085ae165831e93',
      ),
    ).toBe(true)
  })

  it('shortens a long address and leaves a short one whole', () => {
    expect(shortenAddress(evm)).toBe(`0xabab…${evm.slice(-4)}`)
    expect(shortenAddress('short')).toBe('short')
    expect(shortenAddress(evm, 4, 2)).toBe(`0xab…${evm.slice(-2)}`)
  })
})
