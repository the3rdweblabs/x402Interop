// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OneClickQuoteRequest } from '../src/index.js'
import { HttpOneClickClient, OneClickHttpError } from '../src/http-client.js'

const REQUEST: OneClickQuoteRequest = {
  originAsset: 'nep141:base-usdc.omft.near',
  destinationAsset: 'nep141:sui-usdc.omft.near',
  amount: '200000',
  recipient: '0xseller',
  refundTo: '0xbuyer',
  deadline: '2026-11-03T09:00:00.000Z',
  swapType: 'EXACT_OUTPUT',
  depositType: 'ORIGIN_CHAIN',
  recipientType: 'DESTINATION_CHAIN',
}

const QUOTE_RESPONSE = {
  correlationId: 'corr-1',
  signature: 'sig',
  quote: {
    depositAddress: '0xDeposit',
    amountIn: '222270',
    amountInFormatted: '0.22227',
    minAmountIn: '220000',
    amountOut: '200000',
    amountOutFormatted: '0.2',
    withdrawFee: '20000',
    refundFee: '2400',
    timeEstimate: 50,
    // The deposit address stays active for days; this must not become the
    // x402 payment window.
    deadline: '2026-11-06T09:00:00.000Z',
  },
  quoteRequest: {
    deadline: '2026-11-03T09:00:00.000Z',
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HttpOneClickClient', () => {
  it('posts the documented wire body and maps a 201 quote', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(QUOTE_RESPONSE, 201))
    vi.stubGlobal('fetch', fetchMock)

    const client = new HttpOneClickClient('https://one.click/', 'secret')
    const quote = await client.quote(REQUEST)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://one.click/v0/quote')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret')
    expect(JSON.parse(String(init.body))).toEqual({
      originAsset: REQUEST.originAsset,
      destinationAsset: REQUEST.destinationAsset,
      amount: REQUEST.amount,
      recipient: REQUEST.recipient,
      refundTo: REQUEST.refundTo,
      deadline: REQUEST.deadline,
      slippageTolerance: 100,
      swapType: 'EXACT_OUTPUT',
      depositType: 'ORIGIN_CHAIN',
      recipientType: 'DESTINATION_CHAIN',
      refundType: 'ORIGIN_CHAIN',
      dry: false,
    })

    expect(quote).toMatchObject({
      quoteId: '1click-corr-1',
      depositAddress: '0xDeposit',
      originAmount: '222270',
      destinationAmount: '200000',
      minAmountIn: '220000',
      withdrawFee: '20000',
      refundFee: '2400',
      amountInFormatted: '0.22227',
      amountOutFormatted: '0.2',
      timeEstimateSeconds: 50,
      // `quote.deadline` is the 3-day inactivity deadline; the quote echo is
      // the 30-minute payment window we asked for.
      expiresAt: '2026-11-03T09:00:00.000Z',
    })
  })

  it('forwards a custom slippage tolerance', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(QUOTE_RESPONSE, 201))
    vi.stubGlobal('fetch', fetchMock)

    await new HttpOneClickClient().quote({ ...REQUEST, slippageBps: 250 })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).slippageTolerance).toBe(250)
  })

  it('does not reject a dry quote without a deposit address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          correlationId: 'dry-1',
          quote: { amountIn: '222270', amountOut: '200000', timeEstimate: 50 },
          quoteRequest: { deadline: REQUEST.deadline },
        }),
      ),
    )

    const quote = await new HttpOneClickClient().quote({ ...REQUEST, dry: true })
    expect(quote.depositAddress).toBe('')
    expect(quote.expiresAt).toBe(REQUEST.deadline)
  })

  it('requires a deposit address on a non-dry quote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ correlationId: 'c', quote: { amountIn: '1' } })),
    )

    await expect(new HttpOneClickClient().quote(REQUEST)).rejects.toThrow(/depositAddress/)
  })

  it('encodes the deposit memo into the status query', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status: 'SUCCESS',
        depositAddress: '0xDeposit',
        swapDetails: {
          originChainTxHashes: ['0xorigin'],
          destinationChainTxHashes: [{ hash: '0xdest' }],
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const status = await new HttpOneClickClient().status('0xDeposit', '12345')
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe(
      'https://1click.chaindefuser.com/v0/status?depositAddress=0xDeposit&depositMemo=12345',
    )
    expect(status).toMatchObject({
      status: 'SUCCESS',
      originTxHash: '0xorigin',
      destinationTxHash: '0xdest',
    })
  })

  it('keeps the upstream status on non-404 failures', async () => {
    const fetchMock = vi.fn(async () => new Response('bad pair', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new HttpOneClickClient().quote(REQUEST)).rejects.toBeInstanceOf(OneClickHttpError)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
