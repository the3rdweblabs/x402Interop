// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import {
  MockOneClickClient,
  OneClickNotImplementedError,
  parseOneClickQuoteRequest,
  ScaffoldOneClickClient,
} from '../src/index.js'

const request = {
  originAsset: 'nep141:base-usdc.omft.near',
  destinationAsset: 'nep141:sui-usdc.omft.near',
  amount: '50000',
  recipient: 'seller',
  refundTo: 'buyer',
  deadline: '2026-10-27T12:05:00Z',
  swapType: 'EXACT_OUTPUT' as const,
  depositType: 'ORIGIN_CHAIN' as const,
}

describe('ScaffoldOneClickClient', () => {
  const client = new ScaffoldOneClickClient('https://1click.chaindefuser.com')

  it('keeps the configured base URL and does not call it', () => {
    expect(client.baseUrl).toBe('https://1click.chaindefuser.com')
  })

  it('rejects quote, status, and submitDeposit', async () => {
    await expect(client.quote(request)).rejects.toBeInstanceOf(OneClickNotImplementedError)
    await expect(client.status('deposit')).rejects.toMatchObject({ operation: 'status' })
    await expect(
      client.submitDeposit({ depositAddress: 'deposit', txHash: '0xabc' }),
    ).rejects.toMatchObject({ operation: 'submitDeposit', upstream: 'POST /v0/deposit/submit' })
  })

  it('parses a quote request and rejects a non-atomic amount', () => {
    expect(parseOneClickQuoteRequest(request).swapType).toBe('EXACT_OUTPUT')
    expect(() => parseOneClickQuoteRequest({ ...request, amount: '0.05' })).toThrow()
  })
})

describe('MockOneClickClient', () => {
  it('quotes, tracks status, and accepts deposits', async () => {
    const client = new MockOneClickClient()
    const quote = await client.quote(request)
    expect(quote.quoteId).toBeTruthy()
    expect(quote.depositAddress).toBeTruthy()
    const status = await client.status(quote.depositAddress)
    expect(status.status).toBe('PENDING_DEPOSIT')
    const ack = await client.submitDeposit({ depositAddress: quote.depositAddress, txHash: '0xabc' })
    expect(ack.accepted).toBe(true)
    const ack2 = await client.submitDeposit({ depositAddress: 'missing', txHash: '0xabc' })
    expect(ack2.accepted).toBe(false)
    client.setStatus(quote.depositAddress, 'SUCCESS')
    const success = await client.status(quote.depositAddress)
    expect(success.status).toBe('SUCCESS')
    expect(success.destinationTxHash).toBe('0xmockdest')
  })
})
