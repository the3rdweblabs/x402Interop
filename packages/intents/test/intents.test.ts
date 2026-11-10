// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import {
  MockOneClickClient,
  SimulatorOneClickClient,
  isSimulatedOneClickClient,
  parseOneClickQuoteRequest,
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

describe('MockOneClickClient', () => {
  it('quotes, tracks status, and accepts deposits', async () => {
    const client = new MockOneClickClient()
    const quote = await client.quote(request)
    expect(quote.quoteId).toBeTruthy()
    expect(quote.depositAddress).toBeTruthy()
    const status = await client.status(quote.depositAddress)
    expect(status.status).toBe('PENDING_DEPOSIT')
    const ack = await client.submitDeposit({
      depositAddress: quote.depositAddress,
      txHash: '0xabc',
    })
    expect(ack.accepted).toBe(true)
    const ack2 = await client.submitDeposit({ depositAddress: 'missing', txHash: '0xabc' })
    expect(ack2.accepted).toBe(false)
    client.setStatus(quote.depositAddress, 'SUCCESS')
    const success = await client.status(quote.depositAddress)
    expect(success.status).toBe('SUCCESS')
    expect(success.originTxHash).toBe('0xabc')
    expect(success.destinationTxHash).toBe('0xmockdest')
  })

  it('parses valid quote requests', () => {
    expect(parseOneClickQuoteRequest(request)).toMatchObject({
      originAsset: request.originAsset,
      swapType: 'EXACT_OUTPUT',
    })
  })

  it('uses safe defaults for unknown status and simulator seeds', async () => {
    const client = new MockOneClickClient('custom-seed')
    const status = await client.status('unknown')
    expect(status.status).toBe('PENDING_DEPOSIT')
    expect(status.originTxHash).toBeUndefined()
    expect((await client.quote(request)).depositAddress).toContain('0x1c')
    const quoted = await client.quote({ ...request, amount: '1' })
    client.setStatus(quoted.depositAddress, 'SUCCESS')
    expect((await client.status(quoted.depositAddress)).originTxHash).toBe('0xmockorigin')
    expect(isSimulatedOneClickClient(client)).toBe(true)
    expect(isSimulatedOneClickClient(new SimulatorOneClickClient())).toBe(true)
    expect(
      isSimulatedOneClickClient({
        quote: client.quote.bind(client),
        status: client.status.bind(client),
        submitDeposit: client.submitDeposit.bind(client),
      }),
    ).toBe(false)
  })
})
