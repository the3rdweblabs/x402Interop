// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { readMarketplaceEnvironment } from '../src/marketplace.js'
import { allowedCorsOrigins } from '../src/server.js'

describe('production configuration', () => {
  it('requires MARKETPLACE_DOMAIN in production', () => {
    expect(() => readMarketplaceEnvironment({ NODE_ENV: 'production' })).toThrow(
      'MARKETPLACE_DOMAIN must be set in production',
    )
    expect(
      readMarketplaceEnvironment({ NODE_ENV: 'production', MARKETPLACE_DOMAIN: 'x402interop.xyz' })
        .domain,
    ).toBe('x402interop.xyz')
  })

  it('defaults the marketplace domain to localhost outside production', () => {
    expect(readMarketplaceEnvironment({}).domain).toBe('localhost:4321')
  })

  it('allows only the local origins in development', () => {
    const origins = allowedCorsOrigins({})
    expect(origins.has('http://localhost:4321')).toBe(true)
    expect(origins.has('http://127.0.0.1:4321')).toBe(true)
  })

  it('allows no cross-origin access in production unless configured', () => {
    expect(allowedCorsOrigins({ NODE_ENV: 'production' }).size).toBe(0)
    const configured = allowedCorsOrigins({
      NODE_ENV: 'production',
      FACILITATOR_CORS_ORIGINS: 'https://x402interop.xyz',
    })
    expect([...configured]).toEqual(['https://x402interop.xyz'])
    expect(configured.has('http://localhost:4321')).toBe(false)
  })
})
