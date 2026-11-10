// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { base64Of, bodyTextOf, hexOfUtf8, ownerIdOf, sha256Hex } from '../src/lib/wallet.js'

describe('wallet helpers', () => {
  it('encodes UTF-8 messages as hex for personal_sign', () => {
    expect(hexOfUtf8('hi')).toBe('0x6869')
    expect(hexOfUtf8('é')).toBe('0xc3a9')
  })

  it('encodes bytes as base64 for Sui and Solana signatures', () => {
    expect(base64Of(Uint8Array.from([104, 105]))).toBe('aGk=')
  })

  it('hashes the same body text the facilitator hashes', async () => {
    const body = { name: 'Weather', networks: ['eip155:8453'] }
    const text = bodyTextOf(body)
    expect(text).toBe(JSON.stringify(body))
    expect(await sha256Hex(text)).toBe(createHash('sha256').update(text).digest('hex'))
    expect(bodyTextOf(undefined)).toBe('')
    expect(await sha256Hex('')).toBe(createHash('sha256').update('').digest('hex'))
  })

  it('lowercases EVM and Sui owner ids but keeps Solana addresses intact', () => {
    expect(ownerIdOf({ family: 'evm', address: '0xABC', networks: ['eip155:8453'] })).toBe(
      'eip155:8453:0xabc',
    )
    expect(ownerIdOf({ family: 'sui', address: '0xDEF', networks: ['sui:mainnet'] })).toBe(
      'sui:mainnet:0xdef',
    )
    expect(
      ownerIdOf({
        family: 'solana',
        address: 'AbC123',
        networks: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      }),
    ).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:AbC123')
  })

  it('falls back to a family namespace and reference when no network is reported', () => {
    expect(ownerIdOf({ family: 'evm', address: '0xABC', networks: [] })).toBe('evm:mainnet:0xabc')
  })
})
