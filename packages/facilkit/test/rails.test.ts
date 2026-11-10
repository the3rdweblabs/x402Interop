// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MockOneClickClient } from '@x402interop/intents'
import { describe, expect, it } from 'vitest'

import { createInteropFacilitator } from '../src/facilitator.js'
import { FileStore } from '../src/store.js'

const quoteRequest = {
  sellerNetwork: 'sui:mainnet',
  sellerAsset: 'nep141:sui-usdc.omft.near',
  sellerAddress: 'seller',
  amount: '1000000',
  buyerNetwork: 'eip155:8453',
  buyerAsset: 'nep141:base-usdc.omft.near',
  buyerAddress: 'buyer',
  deliveryMode: 'on_deposit',
}

function facilitator(options: Record<string, unknown> = {}) {
  return createInteropFacilitator({
    intentsClient: new MockOneClickClient('rails'),
    store: new FileStore(join(mkdtempSync(join(tmpdir(), 'facil-rails-')), 'store.json')),
    ...options,
  })
}

describe('facilitator safety rails', () => {
  it('rate limits quote, verify, and settle calls', async () => {
    const app = facilitator({ rateLimit: { windowMs: 60_000, max: 1 } })
    expect(await app.routeFacilitator('POST', '/interop/quote', quoteRequest, {})).toMatchObject({
      status: 200,
    })
    expect(await app.routeFacilitator('POST', '/interop/quote', quoteRequest, {})).toMatchObject({
      status: 429,
      body: { error: 'rate_limited' },
    })
    expect(await app.routeFacilitator('POST', '/verify', {}, {})).toMatchObject({
      status: 429,
    })
  })

  it('rejects a quote that would exceed the buyer exposure cap', async () => {
    const app = facilitator({ exposureLimits: { perBuyer: 500_000n } })
    expect(await app.routeFacilitator('POST', '/interop/quote', quoteRequest, {})).toMatchObject({
      status: 502,
      body: { error: 'quote_unavailable', message: expect.stringContaining('Exposure') },
    })
  })

  it('does not cap on_success quotes', async () => {
    const app = facilitator({ exposureLimits: { perBuyer: 1n } })
    expect(
      await app.routeFacilitator(
        'POST',
        '/interop/quote',
        { ...quoteRequest, deliveryMode: 'on_success' },
        {},
      ),
    ).toMatchObject({ status: 200 })
  })

  it('quotes a NEAR seller directly to its final address', async () => {
    const nearQuoteRequest = {
      ...quoteRequest,
      sellerNetwork: 'near:mainnet',
      sellerAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      sellerAddress: 'seller.near',
    }

    const quoted = await facilitator().routeFacilitator(
      'POST',
      '/interop/quote',
      nearQuoteRequest,
      {},
    )
    expect(quoted).toMatchObject({
      status: 200,
      body: {
        network: 'near:mainnet',
        extra: {
          recipient: 'seller.near',
          recipientType: 'DESTINATION_CHAIN',
        },
      },
    })
  })
})
