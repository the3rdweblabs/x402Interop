// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { PaymentRequirements } from '@x402interop/core'
import { describe, expect, it } from 'vitest'

import { createSuiExactClient } from '../src/exact.js'

const SUI_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'

function requirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'sui:mainnet',
    asset: SUI_USDC,
    amount: '1000000',
    payTo: `0x${'44'.repeat(32)}`,
    maxTimeoutSeconds: 300,
    extra: {},
    ...overrides,
  }
}

describe('Sui exact client', () => {
  it('rejects non-exact and non-Sui requirements before touching the RPC', async () => {
    const client = createSuiExactClient({ secretKey: `0x${'11'.repeat(32)}` })

    expect(client.scheme).toBe('exact')
    await expect(
      client.createPaymentPayload(2, requirements({ scheme: 'x402interop-evm' })),
    ).rejects.toThrow('Unsupported scheme')
    await expect(
      client.createPaymentPayload(2, requirements({ network: 'eip155:8453' })),
    ).rejects.toThrow('Unsupported Sui network')
  })
})
