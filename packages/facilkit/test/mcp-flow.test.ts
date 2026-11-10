// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildEvmPaymentPayload } from '../../client/src/evm-signer.js'
import { createMcpBuyerClient } from '../../client/src/mcp-buyer.js'
import { X402_VERSION } from '@x402interop/core'
import { MockOneClickClient } from '@x402interop/intents'
import { afterEach, describe, expect, it } from 'vitest'

import { createInteropFacilitator } from '../src/facilitator.js'
import { FileStore } from '../src/store.js'
import { callTool, type McpToolHandlers } from '../src/mcp.js'
import { MemoryServicesCatalog, type ServiceRecord } from '../src/services.js'
import { privateKeyToAccount } from 'viem/accounts'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const KEY = testPrivateKeyOrPlaceholder()
const HAS_TEST_KEY = hasTestPrivateKey()
const BUYER = privateKeyToAccount(KEY).address

const servers: Server[] = []
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function listen(server: Server): Promise<string> {
  servers.push(server)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('No test port')
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

describe('MCP tools over HTTP', () => {
  it.skipIf(!HAS_TEST_KEY)(
    'searches, quotes, pays, fetches, and reads status in mock mode',
    async () => {
      const content = createServer((req, res) => {
        res.statusCode = 200
        res.setHeader('content-type', 'text/plain')
        res.end(`resource ${req.url}`)
      })
      const contentBase = await listen(content)
      const catalog = new MemoryServicesCatalog()
      const report: ServiceRecord = {
        id: 'report',
        name: 'Settlement report',
        description: 'Paid cross-chain report',
        price: '50000',
        networks: ['sui:mainnet'],
        asset: 'usdc',
        owner: 'sui:mainnet:0xseller',
        payTo: `0x${'a'.repeat(64)}`,
        resourceUrl: `${contentBase}/report`,
        health: 'unknown',
      }
      const priced: ServiceRecord = {
        ...report,
        id: 'priced',
        name: 'Decimal price',
        price: '0.20',
        resourceUrl: `${contentBase}/priced`,
      }
      catalog.register(report)
      catalog.register(priced)
      const dir = mkdtempSync(join(tmpdir(), 'facil-mcp-'))
      dirs.push(dir)
      const facilitator = createInteropFacilitator({
        intentsClient: new MockOneClickClient('mcp-flow'),
        servicesCatalog: catalog,
        store: new FileStore(join(dir, 'store.json')),
        allowPrivateResourceUrls: true,
      })
      const http = createServer((req, res) => {
        void (async () => {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.from(chunk))
          const raw = Buffer.concat(chunks).toString('utf8')
          const body = raw ? (JSON.parse(raw) as unknown) : undefined
          const result = await facilitator.routeFacilitator(
            req.method ?? 'GET',
            req.url ?? '/',
            body,
          )
          res.statusCode = result.status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(result.body))
        })()
      })
      const base = await listen(http)
      const mcp = createMcpBuyerClient({ url: `${base}/mcp` })

      const found = (await mcp.searchServices({ query: 'report', network: 'sui:mainnet' })) as {
        items: { id: string }[]
      }
      expect(found.items.map((item) => item.id)).toContain('report')
      const missed = (await mcp.searchServices({ query: 'report', network: 'eip155:1' })) as {
        items: unknown[]
      }
      expect(missed.items).toHaveLength(0)
      await expect(mcp.getService({ serviceId: 'report' })).resolves.toMatchObject({ id: 'report' })
      await expect(mcp.getService({ serviceId: 'missing' })).rejects.toThrow('Service not found')

      const prepared = (await mcp.callTool('prepare_payment', {
        serviceId: 'report',
        buyerNetwork: 'eip155:8453',
        buyerAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        buyerAddress: BUYER,
      })) as { isError: boolean; data: Record<string, any> }
      expect(prepared.isError).toBe(false)
      const quote = prepared.data
      const requirements = {
        scheme: quote.scheme,
        network: quote.network,
        asset: quote.asset,
        amount: quote.amount,
        payTo: quote.payTo,
        maxTimeoutSeconds: quote.maxTimeoutSeconds,
        extra: quote.extra,
      }
      const txHash = `0x${createHash('sha256').update(String(quote.quoteId)).digest('hex')}`
      const signed = await buildEvmPaymentPayload(
        {
          privateKey: KEY,
          depositAddress: String(quote.depositAddress),
          amount: String(quote.extra.originAmount),
          originNetwork: String(quote.extra.originNetwork),
          originAsset: String(quote.extra.originAsset),
          originAmount: String(quote.extra.originAmount),
          txHash,
        },
        {
          quoteId: String(quote.quoteId),
          depositAddress: String(quote.depositAddress),
          nonce: randomUUID(),
          expiresAt: String(quote.extra.expiresAt),
          originNetwork: String(quote.extra.originNetwork),
          originAsset: String(quote.extra.originAsset),
          originAmount: String(quote.extra.originAmount),
        },
      )
      const paid = (await mcp.payAndFetch({
        serviceId: 'report',
        paymentPayload: {
          x402Version: X402_VERSION,
          accepted: requirements,
          payload: signed.payload,
        },
        paymentRequirements: requirements,
      })) as { status: string; resource: { status: number; body: string } }
      expect(paid.status).toBe('success')
      expect(paid.resource).toMatchObject({ status: 200, body: 'resource /report' })

      await expect(mcp.paymentStatus({ quoteId: String(quote.quoteId) })).resolves.toMatchObject({
        state: 'success',
      })
      await expect(mcp.getCredit({ account: BUYER })).resolves.toEqual({
        account: BUYER,
        spendable: '0',
        pending: '0',
        custody: 'none',
      })
      await expect(mcp.paymentStatus({ quoteId: 'missing' })).rejects.toThrow('Quote not found')
      await expect(
        mcp.callTool('prepare_payment', {
          serviceId: 'priced',
          buyerNetwork: 'eip155:8453',
          buyerAsset: 'usdc',
          buyerAddress: BUYER,
        }),
      ).resolves.toMatchObject({ isError: true, data: { error: 'amount_required' } })
      await expect(
        mcp.callTool('prepare_payment', {
          serviceId: 'report',
          buyerNetwork: 'eip155:8453',
          buyerAsset: 'usdc',
          buyerAddress: BUYER,
          privateKey: KEY,
        }),
      ).resolves.toMatchObject({ isError: true, data: { error: 'rejected_secret' } })

      const rejected = (await mcp.payAndFetch({
        serviceId: 'report',
        paymentPayload: {
          x402Version: X402_VERSION,
          accepted: requirements,
          payload: {},
        },
        paymentRequirements: requirements,
      })) as { status: string }
      expect(rejected.status).toBe('payment_rejected')

      await expect(
        mcp.payAndFetch({
          paymentPayload: {
            x402Version: X402_VERSION,
            accepted: requirements,
            payload: signed.payload,
          },
          paymentRequirements: requirements,
        }),
      ).rejects.toThrow('Nonce has been used')

      const second = (await mcp.callTool('prepare_payment', {
        serviceId: 'report',
        buyerNetwork: 'eip155:8453',
        buyerAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        buyerAddress: BUYER,
      })) as { data: Record<string, any> }
      const again = second.data
      const againRequirements = {
        scheme: again.scheme,
        network: again.network,
        asset: again.asset,
        amount: again.amount,
        payTo: again.payTo,
        maxTimeoutSeconds: again.maxTimeoutSeconds,
        extra: again.extra,
      }
      const againHash = `0x${createHash('sha256').update(`again:${again.quoteId}`).digest('hex')}`
      const againSigned = await buildEvmPaymentPayload(
        {
          privateKey: KEY,
          depositAddress: String(again.depositAddress),
          amount: String(again.extra.originAmount),
          originNetwork: String(again.extra.originNetwork),
          originAsset: String(again.extra.originAsset),
          originAmount: String(again.extra.originAmount),
          txHash: againHash,
        },
        {
          quoteId: String(again.quoteId),
          depositAddress: String(again.depositAddress),
          nonce: randomUUID(),
          expiresAt: String(again.extra.expiresAt),
          originNetwork: String(again.extra.originNetwork),
          originAsset: String(again.extra.originAsset),
          originAmount: String(again.extra.originAmount),
        },
      )
      const noUrl = (await mcp.payAndFetch({
        paymentPayload: {
          x402Version: X402_VERSION,
          accepted: againRequirements,
          payload: againSigned.payload,
        },
        paymentRequirements: againRequirements,
      })) as { status: string; resource: { error: string } }
      expect(noUrl).toMatchObject({ status: 'settled', resource: { error: 'no_resource_url' } })
    },
  )

  it('rejects malformed tool calls and handler failures', async () => {
    const handlers: McpToolHandlers = {
      async search_services() {
        throw new Error('catalog down')
      },
      async get_service() {
        return { isError: false, data: {} }
      },
      async prepare_payment() {
        return { isError: false, data: {} }
      },
      async pay_and_fetch() {
        return {
          isError: false,
          data: { status: 'settled', resource: { error: 'no_resource_url' } },
        }
      },
      async payment_status() {
        return { isError: false, data: {} }
      },
      async get_credit() {
        return { isError: false, data: {} }
      },
    }
    expect((await callTool('search_services', {}, handlers)).content[0]?.text).toContain(
      'catalog down',
    )
    expect((await callTool('get_service', {}, handlers)).isError).toBe(true)
    expect(
      (
        await callTool(
          'pay_and_fetch',
          { privateKey: '0xabc', paymentPayload: {}, paymentRequirements: {} },
          handlers,
        )
      ).content[0]?.text,
    ).toContain('rejected_secret')
    const fetched = JSON.parse(
      (
        await callTool(
          'pay_and_fetch',
          { paymentPayload: { a: 1 }, paymentRequirements: { b: 2 } },
          handlers,
        )
      ).content[0]?.text ?? '{}',
    )
    expect(fetched.resource.error).toBe('no_resource_url')
  })

  it.skipIf(!HAS_TEST_KEY)('fetches a missing resource without retrying the payment', async () => {
    const catalog = new MemoryServicesCatalog()
    catalog.register({
      id: 'down',
      name: 'Down',
      description: 'Unreachable',
      price: '50000',
      networks: ['sui:mainnet'],
      asset: 'usdc',
      owner: 'sui:mainnet:0xseller',
      payTo: `0x${'a'.repeat(64)}`,
      resourceUrl: 'http://127.0.0.1:9/missing',
      health: 'unknown',
    })
    const dir = mkdtempSync(join(tmpdir(), 'facil-mcp-down-'))
    dirs.push(dir)
    const facilitator = createInteropFacilitator({
      intentsClient: new MockOneClickClient('mcp-down'),
      servicesCatalog: catalog,
      store: new FileStore(join(dir, 'store.json')),
    })
    const prepared = await facilitator.handleMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'prepare_payment',
          arguments: {
            serviceId: 'down',
            buyerNetwork: 'eip155:8453',
            buyerAsset: 'usdc',
            buyerAddress: BUYER,
          },
        },
      }),
    )
    const text = (
      (prepared.body as { result: { content: { text: string }[] } }).result.content[0] as {
        text: string
      }
    ).text
    const quote = JSON.parse(text) as Record<string, any>
    const requirements = {
      scheme: quote.scheme,
      network: quote.network,
      asset: quote.asset,
      amount: quote.amount,
      payTo: quote.payTo,
      maxTimeoutSeconds: quote.maxTimeoutSeconds,
      extra: quote.extra,
    }
    const txHash = `0x${'ab'.repeat(32)}`
    const signed = await buildEvmPaymentPayload(
      {
        privateKey: KEY,
        depositAddress: String(quote.depositAddress),
        amount: String(quote.extra.originAmount),
        originNetwork: String(quote.extra.originNetwork),
        originAsset: String(quote.extra.originAsset),
        originAmount: String(quote.extra.originAmount),
        txHash,
      },
      {
        quoteId: String(quote.quoteId),
        depositAddress: String(quote.depositAddress),
        nonce: randomUUID(),
        expiresAt: String(quote.extra.expiresAt),
        originNetwork: String(quote.extra.originNetwork),
        originAsset: String(quote.extra.originAsset),
        originAmount: String(quote.extra.originAmount),
      },
    )
    const paid = await facilitator.handleMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'pay_and_fetch',
          arguments: {
            serviceId: 'down',
            paymentPayload: {
              x402Version: X402_VERSION,
              accepted: requirements,
              payload: signed.payload,
            },
            paymentRequirements: requirements,
          },
        },
      }),
    )
    const outcome = JSON.parse(
      (
        (paid.body as { result: { content: { text: string }[] } }).result.content[0] as {
          text: string
        }
      ).text,
    ) as { status: string; resource: { error: string } }
    expect(outcome.status).toBe('settled')
    expect(outcome.resource.error.length).toBeGreaterThan(0)
  })
})
