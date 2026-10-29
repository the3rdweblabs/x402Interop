// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { sellerMiddleware, sellerOptions } from '../src/index.js'

describe('Sui seller example', () => {
  it('protects a route that wants payment on Sui', () => {
    expect(sellerOptions.network).toBe('sui:mainnet')
    expect(sellerOptions.deliveryMode).toBe('on_deposit')
    const headers: Record<string, string> = {}
    let body = ''
    let continued = false
    const response = {
      statusCode: 200,
      setHeader(name: string, value: string | number) {
        headers[name] = String(value)
      },
      end(payload?: string) {
        body = payload ?? ''
      },
    }
    sellerMiddleware()({ headers: {} }, response, () => {
      continued = true
    })
    expect(response.statusCode).toBe(402)
    expect(headers['content-type']).toContain('application/json')
    expect(JSON.parse(body).accepts[0].network).toBe('sui:mainnet')
    expect(continued).toBe(false)
  })
})
