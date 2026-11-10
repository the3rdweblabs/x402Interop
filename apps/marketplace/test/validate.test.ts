// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { addressError, atomicAmountError, isHttpUrl } from '../src/lib/validate.js'

const EVM = '0x' + '1'.repeat(40)
const SUI = '0x' + 'a'.repeat(64)
const SOL = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'

describe('isHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(isHttpUrl('https://api.example.com/weather')).toBe(true)
    expect(isHttpUrl('http://127.0.0.1:8080/x')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:text/html,hi')).toBe(false)
    expect(isHttpUrl('ftp://example.com')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
  })
})

describe('addressError', () => {
  it('checks EVM, Sui, and Solana addresses against their family', () => {
    expect(addressError('eip155:8453', EVM)).toBeUndefined()
    expect(addressError('eip155:8453', 'buyer')).toMatch(/0x-prefixed 40-character hex/)
    expect(addressError('eip155:8453', '0x' + '1'.repeat(39))).toMatch(/40-character hex/)
    expect(addressError('sui:mainnet', SUI)).toBeUndefined()
    expect(addressError('sui:mainnet', 'seller')).toMatch(/64-character hex/)
    expect(addressError(`solana:${SOL}`, SOL)).toBeUndefined()
    expect(addressError(`solana:${SOL}`, '0OIl' + 'a'.repeat(30))).toMatch(/base58/)
  })

  it('rejects an address from the wrong family', () => {
    expect(addressError('sui:mainnet', EVM)).toContain('sui:mainnet')
    expect(addressError('eip155:8453', SUI)).toContain('eip155:8453')
  })

  it('does not fake a pass for families it does not check', () => {
    expect(addressError('near:mainnet', 'alice.near')).toBeUndefined()
    expect(addressError('bip122:000000000019d6689c085ae165831e93', 'anything')).toBeUndefined()
  })

  it('names unknown networks rather than accepting anything', () => {
    expect(addressError('not-a-network', 'x')).toContain('Unknown network')
  })
})

describe('atomicAmountError', () => {
  it('requires a positive whole number', () => {
    expect(atomicAmountError('50000')).toBeUndefined()
    expect(atomicAmountError('0')).toMatch(/whole number/)
    expect(atomicAmountError('0.05')).toMatch(/whole number/)
    expect(atomicAmountError('-1')).toMatch(/whole number/)
    expect(atomicAmountError('')).toMatch(/whole number/)
  })
})
