// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { buyerAgent, buyerClient, describeBuyerFlow, samplePrepare } from '../src/index.js'

describe('buyer agent on Base', () => {
  it('describes an offline Base flow', async () => {
    expect(buyerAgent.buyerNetwork).toBe('eip155:8453')
    expect(samplePrepare.buyerNetwork).toBe('eip155:8453')
    expect(describeBuyerFlow()).toMatch(/Base/)
    await expect(buyerClient().paymentStatus({ quoteId: 'q-1' })).rejects.toThrow(/not implemented/)
  })
})
