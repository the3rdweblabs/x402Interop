// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { Server } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createDiscoveryServer,
  methodOf,
  requestPath,
  routeDiscovery,
  searchQuery,
  urlOf,
} from '../src/index.js'
import { MemoryDiscoveryIndex } from '@x402interop/discovery'

const service = {
  id: 'price-feed',
  name: 'Token price feed',
  description: 'Spot prices',
  price: '0.05',
  networks: ['sui:mainnet'],
  asset: 'usdc',
  health: 'healthy',
  source: 'direct',
}

describe('discovery helpers', () => {
  it('normalises method, path, and search params', () => {
    expect(methodOf(undefined)).toBe('GET')
    expect(methodOf('POST')).toBe('POST')
    expect(urlOf(undefined)).toBe('/')
    expect(urlOf('/health')).toBe('/health')
    expect(createDiscoveryServer(new MemoryDiscoveryIndex())).toBeDefined()
    expect(requestPath(undefined)).toBe('/')
    expect(requestPath('')).toBe('/')
    expect(requestPath('/health')).toBe('/health')
    expect(requestPath('/health?x=1')).toBe('/health')
    expect(requestPath('?')).toBe('/')
    expect(searchQuery('/interop/discovery/search')).toEqual({
      q: undefined,
      network: undefined,
      asset: undefined,
      maxPrice: undefined,
      category: undefined,
      limit: undefined,
    })
    expect(
      searchQuery(
        '/interop/discovery/search?q=price&network=sui:mainnet&asset=usdc&maxPrice=0.10&category=data&limit=5',
      ),
    ).toMatchObject({ q: 'price', network: 'sui:mainnet', limit: 5 })
    expect(searchQuery('/interop/discovery/search?limit=nope').limit).toBeUndefined()
  })
})

describe('routeDiscovery', () => {
  it('registers, searches, and fetches a service', () => {
    const index = new MemoryDiscoveryIndex()
    expect(routeDiscovery('GET', '/health', undefined, index).status).toBe(200)
    expect(routeDiscovery('POST', '/health', undefined, index).status).toBe(404)
    expect(routeDiscovery('POST', '/interop/discovery/register', {}, index).status).toBe(400)
    expect(routeDiscovery('POST', '/interop/discovery/register', service, index).status).toBe(201)
    const found = routeDiscovery('GET', '/interop/discovery/search?q=price', undefined, index)
    expect(found.status).toBe(200)
    expect(found.body).toMatchObject({ services: [expect.objectContaining({ id: 'price-feed' })] })
    expect(routeDiscovery('GET', '/interop/discovery/price-feed', undefined, index).status).toBe(
      200,
    )
    expect(routeDiscovery('GET', '/interop/discovery/missing', undefined, index).status).toBe(404)
    expect(routeDiscovery('GET', '/nope', undefined, index).status).toBe(404)
  })
})

describe('HTTP server', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = createDiscoveryServer()
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP port')
    base = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('registers over HTTP and rejects a bad body', async () => {
    const created = await fetch(`${base}/interop/discovery/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(service),
    })
    expect(created.status).toBe(201)
    const health = await fetch(`${base}/health`)
    expect(await health.json()).toMatchObject({ service: 'discovery' })
    const bad = await fetch(`${base}/interop/discovery/register`, { method: 'POST', body: '{' })
    expect(bad.status).toBe(400)
  })
})
