// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MemoryDiscoveryIndex, parseServiceRecord } from '../src/lib/catalog.js'
import {
  DEFAULT_FACILITATOR_URL,
  facilitatorUrl,
  fetchHealth,
  fetchSupportedKinds,
  requestQuote,
  type QuoteInput,
  type QuoteResult,
} from '../src/lib/facilitator.js'
import {
  checkResourceHealth,
  deleteResource,
  fetchMarketplaceFees,
  getResource,
  listMerchants,
  registerResource,
  searchResources,
  updateResource,
} from '../src/lib/marketplace.js'

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

const quoteInput: QuoteInput = {
  sellerNetwork: 'sui:mainnet',
  sellerAsset: 'usdc',
  sellerAddress: 'seller',
  amount: '50000',
  buyerNetwork: 'eip155:8453',
  buyerAsset: 'usdc',
  buyerAddress: 'buyer',
  deliveryMode: 'on_deposit',
}

const quoteResult: QuoteResult = {
  scheme: 'x402interop-evm',
  quoteId: 'q_123',
  depositAddress: '0xdeposit',
  originNetwork: 'eip155:8453',
  originAsset: 'usdc',
  originAmount: '50000',
  expiresAt: '2026-10-31T00:00:00.000Z',
  timeEstimateSeconds: 45,
}

function stubFetch(body: unknown, status = 200, statusText = 'OK') {
  const mock = vi.fn(async (_input: unknown, _init?: unknown): Promise<Response> => {
    return new Response(JSON.stringify(body), {
      status,
      statusText,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('MemoryDiscoveryIndex catalog search', () => {
  const index = new MemoryDiscoveryIndex()
  index.register({
    id: 'a',
    name: 'Alpha feed',
    description: 'ETH prices',
    price: '0.05',
    networks: ['eip155:8453'],
    asset: 'usdc',
    health: 'healthy',
    source: 'direct',
    category: 'data',
  })
  index.register({
    id: 'b',
    name: 'Beta feed',
    description: 'Stats',
    price: '9.99',
    networks: ['sui:mainnet'],
    asset: 'sui',
    health: 'healthy',
    source: 'direct',
    category: 'metrics',
  })

  it('filters by query, network, asset, category, price, and limit', () => {
    expect(index.search({ q: 'alpha' }).map((s) => s.id)).toEqual(['a'])
    expect(index.search({ q: 'missing' }).map((s) => s.id)).toEqual([])
    expect(index.search({ network: 'sui:mainnet' }).map((s) => s.id)).toEqual(['b'])
    expect(index.search({ asset: 'sui' }).map((s) => s.id)).toEqual(['b'])
    expect(index.search({ asset: 'eth' }).map((s) => s.id)).toEqual([])
    expect(index.search({ category: 'metrics' }).map((s) => s.id)).toEqual(['b'])
    expect(index.search({ category: 'nope' }).map((s) => s.id)).toEqual([])
    expect(index.search({ maxPrice: '1' }).map((s) => s.id)).toEqual(['a'])
    expect(index.search({ maxPrice: '0.01' }).map((s) => s.id)).toEqual([])
    expect(index.search({ maxPrice: 'not-a-number' }).map((s) => s.id)).toEqual(['a', 'b'])
    expect(index.search({ limit: 1 }).map((s) => s.id)).toEqual(['a'])
    expect(index.search({ limit: 1, network: 'sui:mainnet' }).map((s) => s.id)).toEqual(['b'])
  })
})

describe('service record parsing', () => {
  it('registers, fetches, and validates records', () => {
    const index = new MemoryDiscoveryIndex()
    const record = parseServiceRecord({
      ...service,
      category: 'data',
      resourceUrl: 'https://example.com/catalog',
    })
    expect(record).toMatchObject({ id: 'price-feed', category: 'data' })
    expect(() => parseServiceRecord({ ...service, price: 'not-a-price' })).toThrow()
    expect(() => parseServiceRecord({ ...service, health: 'bogus' })).toThrow()
    index.register(record)
    expect(index.get('price-feed')).toMatchObject({ source: 'direct' })
    expect(index.get('missing')).toBeUndefined()
  })
})

describe('facilitator HTTP helpers', () => {
  it('defaults to the local facilitator URL', () => {
    expect(facilitatorUrl()).toBe(DEFAULT_FACILITATOR_URL)
  })

  describe('marketplace HTTP helpers', () => {
    it('searches resources with encoded filters', async () => {
      const mock = stubFetch({ resources: [], total: 0, limit: 20, offset: 0 })
      await searchResources({ q: 'weather api', network: 'eip155:8453', limit: 5 })
      expect(mock).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/discovery/resources?q=weather+api&network=eip155%3A8453&limit=5`,
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('loads resources and merchants', async () => {
      stubFetch({ resource: { id: 'weather' } })
      await expect(getResource('weather')).resolves.toEqual({ resource: { id: 'weather' } })
      stubFetch({ merchants: [{ owner: 'seller', count: 1, networks: [], assets: [] }] })
      await expect(listMerchants()).resolves.toMatchObject({ merchants: [{ owner: 'seller' }] })
    })

    it('registers a resource with API-key and signature headers', async () => {
      const mock = stubFetch({ ok: true, resource: { id: 'weather' } }, 201, 'Created')
      await registerResource(
        {
          name: 'Weather',
          description: 'Current weather',
          price: '0.01',
          networks: ['eip155:8453'],
          asset: 'usdc',
          owner: 'seller',
          resourceUrl: 'https://example.com/weather',
        },
        undefined,
        { apiKey: 'key', signature: 'sig' },
      )
      expect(mock).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/discovery/resources`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer key',
            'x-x402interop-signature': 'sig',
          }),
        }),
      )
    })

    it('updates and checks resource health with auth headers', async () => {
      const mock = stubFetch({ ok: true, resource: { id: 'weather' } })
      await updateResource('weather', { description: 'Updated' }, undefined, {
        apiKey: 'key',
        signature: 'sig',
      })
      await checkResourceHealth('weather', undefined, { apiKey: 'key', signature: 'sig' })
      await updateResource('weather', { description: 'Public shape test' })
      await checkResourceHealth('weather')
      expect(mock).toHaveBeenNthCalledWith(
        1,
        `${DEFAULT_FACILITATOR_URL}/discovery/resources/weather`,
        expect.objectContaining({ method: 'PATCH' }),
      )
      expect(mock).toHaveBeenNthCalledWith(
        2,
        `${DEFAULT_FACILITATOR_URL}/discovery/resources/weather/health`,
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('surfaces marketplace HTTP failures and supports unauthenticated reads', async () => {
      stubFetch({ error: 'down' }, 503, 'Service Unavailable')
      await expect(getResource('missing')).rejects.toThrow('503 Service Unavailable')
      const mock = stubFetch({ ok: true, resource: { id: 'weather' } })
      await registerResource({
        name: 'Weather',
        description: 'Current weather',
        price: '0.01',
        networks: ['eip155:8453'],
        asset: 'usdc',
        owner: 'seller',
        resourceUrl: 'https://example.com/weather',
      })
      expect(mock).toHaveBeenCalled()
    })

    it('surfaces the server message from a 402 registration response', async () => {
      stubFetch(
        { error: 'payment_required', message: 'A registration fee payment is required' },
        402,
        'Payment Required',
      )
      await expect(
        registerResource({
          name: 'Weather',
          description: 'Current weather',
          price: '0.01',
          networks: ['eip155:8453'],
          asset: 'usdc',
          owner: 'seller',
          resourceUrl: 'https://example.com/weather',
        }),
      ).rejects.toThrow('402 Payment Required for /discovery/resources: A registration fee payment')
    })

    it('reports a non-JSON error body without a detail', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('<html>oops</html>', { status: 500, statusText: 'Internal Server Error' }),
        ),
      )
      const error = await getResource('x').catch((reason: unknown) => reason)
      expect((error as Error).message).toBe(
        'discovery returned 500 Internal Server Error for /discovery/resources/x',
      )
    })

    it('deletes a listing with a signature header', async () => {
      const mock = stubFetch({ ok: true, id: 'weather' })
      await expect(deleteResource('weather', undefined, { signature: 'sig' })).resolves.toEqual({
        ok: true,
        id: 'weather',
      })
      expect(mock).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/discovery/resources/weather`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ 'x-x402interop-signature': 'sig' }),
        }),
      )
    })

    it('loads configured marketplace fees', async () => {
      const fees = {
        registration: [
          { network: 'eip155:8453', asset: 'usdc', amount: '100000', treasury: '0xfee' },
        ],
        featured: { '30d': [], '60d': [] },
      }
      const mock = stubFetch(fees)
      await expect(fetchMarketplaceFees()).resolves.toEqual(fees)
      expect(mock).toHaveBeenCalledWith(
        `${DEFAULT_FACILITATOR_URL}/marketplace/fees`,
        expect.objectContaining({ method: 'GET' }),
      )
    })
  })

  it('prefers PUBLIC_FACILITATOR_URL and trims trailing slashes', () => {
    vi.stubEnv('PUBLIC_FACILITATOR_URL', 'https://facilitator.example:4020/')
    expect(facilitatorUrl()).toBe('https://facilitator.example:4020')
  })

  it('fetches health from /health', async () => {
    const mock = stubFetch({ status: 'ok', service: 'facilitator' })
    const health = await fetchHealth('http://facilitator.example:4020')
    expect(health).toEqual({ status: 'ok', service: 'facilitator' })
    expect(mock).toHaveBeenCalledWith(
      'http://facilitator.example:4020/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('fetches the supported kinds from /supported', async () => {
    const mock = stubFetch({
      kinds: [
        { x402Version: 2, scheme: 'x402interop-evm', network: 'eip155:8453' },
        {
          x402Version: 2,
          scheme: 'x402interop-sui',
          network: 'sui:mainnet',
          extra: { note: 'ok' },
        },
      ],
      extensions: ['x402interop'],
      signers: { evm: ['0xsigner'] },
    })
    const supported = await fetchSupportedKinds('http://facilitator.example:4020')
    expect(supported.kinds).toHaveLength(2)
    expect(supported.extensions).toEqual(['x402interop'])
    expect(supported.signers).toEqual({ evm: ['0xsigner'] })
    expect(supported.kinds[0]).toEqual({
      x402Version: 2,
      scheme: 'x402interop-evm',
      network: 'eip155:8453',
    })
    expect(mock).toHaveBeenCalledWith(
      'http://facilitator.example:4020/supported',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('throws when the facilitator answers with a non-OK status', async () => {
    stubFetch({ error: 'flaky' }, 503, 'Service Unavailable')
    await expect(fetchSupportedKinds('http://facilitator.example:4020')).rejects.toThrow(
      'Facilitator returned 503 Service Unavailable',
    )
  })

  it('mints a quote through POST /interop/quote', async () => {
    const mock = stubFetch(quoteResult)
    const quote = await requestQuote(quoteInput)
    expect(quote).toEqual(quoteResult)
    expect(mock).toHaveBeenCalledWith(
      `${DEFAULT_FACILITATOR_URL}/interop/quote`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(quoteInput) }),
    )
  })

  it('throws when the quote request hits a non-OK status', async () => {
    stubFetch({ error: 'down' }, 502, 'Bad Gateway')
    await expect(requestQuote(quoteInput)).rejects.toThrow('502 Bad Gateway')
  })

  it('throws on OK responses carrying an error body', async () => {
    stubFetch({ error: 'invalid_seller' }, 200)
    await expect(requestQuote(quoteInput)).rejects.toThrow('invalid_seller')
  })
})
