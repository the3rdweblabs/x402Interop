// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createInteropFacilitator } from '../src/facilitator.js'
import { FileStore } from '../src/store.js'

function facilitator(extra: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'zero-fee-'))
  return createInteropFacilitator({
    store: new FileStore(join(dir, 'store.json')),
    ...extra,
  })
}

const listing = {
  name: 'Free feed',
  description: 'No fee',
  price: '0.01',
  networks: ['eip155:8453'],
  asset: 'usdc',
  resourceUrl: 'https://example.com/feed',
}

describe('zero-priced listing fees', () => {
  it('treats a fee schedule of zero as free and lists without payment', async () => {
    const zero = facilitator({
      marketplaceApiKeys: { key: 'seller' },
      marketplaceFees: {
        registration: [
          { network: 'eip155:8453', asset: 'usdc', amount: '0', treasury: '0xtreasury' },
        ],
        featured: { '30d': [], '60d': [] },
      },
    })
    const fees = await zero.routeFacilitator('GET', '/marketplace/fees', undefined)
    expect(fees.body).toMatchObject({ free: true })

    const created = await zero.routeFacilitator('POST', '/discovery/resources', listing, {
      authorization: 'Bearer key',
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ free: true, resource: { owner: 'seller' } })
  })

  it('still charges when a fee is non-zero', async () => {
    const paid = facilitator({
      marketplaceApiKeys: { key: 'seller' },
      marketplaceFees: {
        registration: [
          { network: 'eip155:8453', asset: 'usdc', amount: '100000', treasury: '0xtreasury' },
        ],
        featured: { '30d': [], '60d': [] },
      },
    })
    const created = await paid.routeFacilitator(
      'POST',
      '/discovery/resources',
      { ...listing, paymentNetwork: 'eip155:8453', paymentAsset: 'usdc' },
      { authorization: 'Bearer key' },
    )
    expect(created.status).toBe(402)
  })
})

describe('listing health checks and private targets', () => {
  async function checkPrivateListing(allowPrivateResourceUrls: boolean) {
    const instance = facilitator({
      marketplaceApiKeys: { key: 'seller' },
      marketplaceFreeListings: true,
      ...(allowPrivateResourceUrls ? { allowPrivateResourceUrls: true } : {}),
    })
    await instance.routeFacilitator(
      'POST',
      '/discovery/resources',
      { ...listing, name: 'Local feed', resourceUrl: 'http://127.0.0.1:9/feed' },
      { authorization: 'Bearer key' },
    )
    const result = await instance.routeFacilitator(
      'POST',
      '/discovery/resources/local-feed/health',
      undefined,
      { authorization: 'Bearer key' },
    )
    return result.body as { resource: { health: string; healthMessage?: string } }
  }

  it('refuses to fetch a private listing by default', async () => {
    const body = await checkPrivateListing(false)
    expect(body.resource.health).toBe('unhealthy')
    expect(body.resource.healthMessage).toContain('Private and loopback')
  })

  it('attempts the fetch when private targets are explicitly allowed', async () => {
    const body = await checkPrivateListing(true)
    expect(body.resource.health).toBe('unhealthy')
    expect(body.resource.healthMessage).not.toContain('Private and loopback')
  })
})
