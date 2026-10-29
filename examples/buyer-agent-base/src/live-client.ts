// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { decodePaymentRequired, enforceHardPriceCap } from '@x402interop/client'

export class LiveBuyerClient {
  constructor(private readonly facilitatorUrl?: string) {}

  async fetchWithPreview(url: string, maxPrice?: string) {
    const res = await fetch(url)
    if (res.status !== 402) {
      return { status: res.status, data: await res.text() }
    }
    const paymentRequired = await decodePaymentRequired(res)
    const preview = paymentRequired.accepts.map((a: any) => ({
      scheme: a.scheme,
      network: a.network,
      amount: a.amount,
      displayPrice: a.extra?.displayPrice,
      quoteId: a.extra?.quoteId,
    }))
    console.log('Price preview:', preview)
    if (maxPrice) {
      enforceHardPriceCap(paymentRequired, maxPrice)
    }
    return { status: 402, paymentRequired, preview }
  }
}

export const liveBuyerClient = new LiveBuyerClient()
