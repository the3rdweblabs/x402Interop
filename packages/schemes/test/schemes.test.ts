// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import {
  bindingMatchesQuote,
  SCHEME_IDS,
  summaryForScheme,
  type InteropBinding,
} from '../src/index.js'

const binding: InteropBinding = {
  quoteId: 'q-1',
  depositAddress: 'deposit',
  nonce: 'abc',
  expiresAt: '2026-10-27T12:00:00Z',
}

const quote = {
  quoteId: 'q-1',
  depositAddress: 'deposit',
  expiresAt: '2026-10-27T12:00:00Z',
}

describe('scheme family', () => {
  it('describes a known scheme and ignores unknown ids', () => {
    expect(summaryForScheme(SCHEME_IDS.near)).toMatch(/NEP-366/)
    expect(summaryForScheme('exact')).toBeUndefined()
  })

  it('accepts a binding that pins the quote and rejects tampering', () => {
    expect(bindingMatchesQuote(binding, quote)).toBe(true)
    expect(bindingMatchesQuote({ ...binding, quoteId: 'other' }, quote)).toBe(false)
    expect(bindingMatchesQuote({ ...binding, depositAddress: 'other' }, quote)).toBe(false)
    expect(bindingMatchesQuote({ ...binding, expiresAt: '2026-10-27T13:00:00Z' }, quote)).toBe(
      false,
    )
    expect(bindingMatchesQuote({ ...binding, nonce: '' }, quote)).toBe(false)
  })
})
