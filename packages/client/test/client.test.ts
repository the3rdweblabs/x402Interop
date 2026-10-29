// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { ClientNotImplementedError, SWAP_STATES, createScaffoldClient } from '../src/index.js'

describe('createScaffoldClient', () => {
  const client = createScaffoldClient()

  it('lists the swap states a status view can take', () => {
    expect(SWAP_STATES).toContain('refunded')
  })

  it('refuses prepare, status, and credit without calling out', async () => {
    await expect(
      client.preparePayment({
        serviceId: 'price-feed',
        buyerNetwork: 'eip155:8453',
        buyerAsset: 'usdc',
        buyerAddress: 'buyer',
      }),
    ).rejects.toBeInstanceOf(ClientNotImplementedError)
    await expect(client.paymentStatus({ quoteId: 'q-1' })).rejects.toMatchObject({
      operation: 'paymentStatus',
    })
    await expect(client.getCredit({ account: 'buyer' })).rejects.toMatchObject({
      operation: 'getCredit',
    })
  })
})
