// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  FileStore,
  MemoryServicesCatalog,
  createInteropFacilitator,
  createMarketplaceAuthenticator,
} from '../src/index.js'
import type { MarketplaceFeeConfig } from '../src/fees.js'

const fees: MarketplaceFeeConfig = {
  registration: [{ network: 'eip155:8453', asset: 'usdc', amount: '100', treasury: 'treasury' }],
  featured: { '30d': [], '60d': [] },
}

const listing = {
  name: 'Weather API',
  description: 'Current weather',
  price: '1',
  networks: ['eip155:8453'],
  asset: 'usdc',
  owner: 'seller',
  resourceUrl: 'https://example.com/weather',
  paymentNetwork: 'eip155:8453',
  paymentAsset: 'usdc',
}

function create(options: Record<string, unknown> = {}) {
  return createInteropFacilitator({
    store: new FileStore(
      join(tmpdir(), `facilkit-routes-${Math.random().toString(16).slice(2)}.json`),
    ),
    marketplaceFees: fees,
    marketplaceAuthenticator: createMarketplaceAuthenticator({ apiKeys: { key: 'seller' } }),
    servicesCatalog: new MemoryServicesCatalog(),
    listingPaymentProcessor: { settle: async () => ({ success: true, transaction: '0xfee' }) },
    ...options,
  })
}

describe('marketplace route error handling', () => {
  it('covers public discovery filters and missing resources', async () => {
    const facilitator = create()
    expect(
      await facilitator.routeFacilitator('GET', '/discovery/resources', undefined),
    ).toMatchObject({
      status: 200,
      body: { resources: [], total: 0 },
    })
    expect(
      await facilitator.routeFacilitator('GET', '/discovery/resources/missing', undefined),
    ).toMatchObject({
      status: 404,
    })
    expect(
      await facilitator.routeFacilitator('GET', '/discovery/merchants', undefined),
    ).toMatchObject({
      status: 200,
      body: { merchants: [] },
    })
  })

  it('handles registration payment and configuration failures', async () => {
    const noFees = create({ marketplaceFees: undefined })
    expect(
      await noFees.routeFacilitator('POST', '/discovery/resources', listing, {
        authorization: 'Bearer key',
      }),
    ).toMatchObject({ status: 503, body: { error: 'fees_unavailable' } })

    const noProcessor = create({ listingPaymentProcessor: null as never })
    expect(
      await noProcessor.routeFacilitator('POST', '/discovery/resources', listing, {
        authorization: 'Bearer key',
        'payment-signature': 'signed',
      }),
    ).toMatchObject({ status: 402, body: { error: 'payment_rejected' } })

    const rejected = create({
      listingPaymentProcessor: { settle: async () => ({ success: false, reason: 'rejected' }) },
    })
    expect(
      await rejected.routeFacilitator('POST', '/discovery/resources', listing, {
        authorization: 'Bearer key',
        'payment-signature': 'signed',
      }),
    ).toMatchObject({ status: 402, body: { error: 'payment_rejected' } })
  })

  it('allows free registration when free listings are enabled', async () => {
    const free = create({ marketplaceFees: undefined, marketplaceFreeListings: true })

    expect(await free.routeFacilitator('GET', '/marketplace/fees', undefined)).toMatchObject({
      status: 200,
      body: { free: true, registration: [] },
    })
    expect(
      await free.routeFacilitator('POST', '/discovery/resources', listing, {
        authorization: 'Bearer key',
      }),
    ).toMatchObject({ status: 201, body: { free: true } })
  })

  it('rejects invalid ownership, duplicate ids, fee assets, and malformed records', async () => {
    const facilitator = create()
    const headers = { authorization: 'Bearer key', 'payment-signature': 'signed' }
    expect(
      await facilitator.routeFacilitator('POST', '/discovery/resources', listing, headers),
    ).toMatchObject({
      status: 201,
    })
    expect(
      await facilitator.routeFacilitator('POST', '/discovery/resources', listing, headers),
    ).toMatchObject({
      status: 409,
    })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...listing, owner: 'other' },
        headers,
      ),
    ).toMatchObject({
      status: 403,
    })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...listing, id: 'eth-api', paymentAsset: 'eth' },
        headers,
      ),
    ).toMatchObject({
      status: 400,
    })
    expect(
      await facilitator.routeFacilitator('POST', '/discovery/resources', { name: 'bad' }, headers),
    ).toMatchObject({
      status: 400,
    })
  })

  it('requires payment signatures and protects resource management', async () => {
    const facilitator = create()
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources',
        { ...listing, id: 'payment-api' },
        {
          authorization: 'Bearer key',
        },
      ),
    ).toMatchObject({ status: 402, body: { error: 'payment_required' } })
    expect(
      await facilitator.routeFacilitator(
        'PUT',
        '/discovery/resources/missing',
        {},
        {
          authorization: 'Bearer key',
        },
      ),
    ).toMatchObject({ status: 404 })
    expect(
      await facilitator.routeFacilitator('POST', '/discovery/resources/missing/health', undefined, {
        authorization: 'Bearer key',
      }),
    ).toMatchObject({ status: 404 })
  })

  it('handles invalid updates, health methods, and checker failures', async () => {
    const checker = vi.fn(async () => {
      throw new Error('health unavailable')
    })
    const facilitator = create({ serviceHealthChecker: checker })
    const headers = { authorization: 'Bearer key', 'payment-signature': 'signed' }
    await facilitator.routeFacilitator('POST', '/discovery/resources', listing, headers)
    expect(
      await facilitator.routeFacilitator(
        'GET',
        '/discovery/resources/weather-api/health',
        undefined,
        headers,
      ),
    ).toMatchObject({
      status: 404,
    })
    expect(
      await facilitator.routeFacilitator(
        'POST',
        '/discovery/resources/weather-api/health',
        undefined,
        {
          authorization: 'Bearer other',
        },
      ),
    ).toMatchObject({ status: 401 })
    expect(
      await facilitator.routeFacilitator(
        'PATCH',
        '/discovery/resources/weather-api',
        { price: 'bad' },
        headers,
      ),
    ).toMatchObject({
      status: 400,
    })
    await expect(
      facilitator.routeFacilitator(
        'POST',
        '/discovery/resources/weather-api/health',
        undefined,
        headers,
      ),
    ).rejects.toThrow('health unavailable')
  })

  it('records a settled listing payment and audit event', async () => {
    const recordListingPayment = vi.fn(async () => undefined)
    const recordAuditEvent = vi.fn(async () => undefined)
    const facilitator = create({
      persistence: {
        recordListingPayment,
        recordAuditEvent,
        findListingPayment: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      },
    })

    expect(
      await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
        authorization: 'Bearer key',
        'payment-signature': 'signed',
      }),
    ).toMatchObject({ status: 201 })

    expect(recordListingPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'weather-api',
        owner: 'seller',
        kind: 'registration',
        network: 'eip155:8453',
        asset: 'usdc',
        amount: '100',
        treasury: 'treasury',
        transactionId: '0xfee',
        status: 'settled',
      }),
    )
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'seller',
        action: 'listing_registered',
        resourceId: 'weather-api',
      }),
    )
  })

  it('still lists a paid resource when the ledger write fails', async () => {
    const facilitator = create({
      persistence: {
        recordListingPayment: vi.fn(async () => {
          throw new Error('database unavailable')
        }),
        recordAuditEvent: vi.fn(async () => undefined),
        findListingPayment: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      },
    })

    expect(
      await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
        authorization: 'Bearer key',
        'payment-signature': 'signed',
      }),
    ).toMatchObject({ status: 201 })
  })
})
