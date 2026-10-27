// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { describe, expect, it } from 'vitest'

import {
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
