// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { sellerMiddleware, sellerOptions } from '../src/index.js'

describe('NEAR seller example', () => {
  it('waits for swap success before serving', () => {
    expect(sellerOptions.network).toBe('near:mainnet')
    expect(sellerOptions.payTo).toBe('seller.near')
    let continued = false
    sellerMiddleware()(
      { headers: { 'payment-signature': 'signed' } },
      {
        statusCode: 200,
        setHeader() {},
        end() {},
      },
      () => {
        continued = true
      },
    )
    expect(continued).toBe(true)
  })
})
