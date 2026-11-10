// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PaymentRequirements } from '@x402interop/core'
import { MockOneClickClient } from '@x402interop/intents'
import { describe, expect, it, vi } from 'vitest'

import { createInteropFacilitator } from '../src/facilitator.js'
import { FileStore } from '../src/store.js'
import { settleWithAdapter, verifyWithAdapter } from '../src/verifier.js'

const SUI_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
const NEAR_USDC = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'

function exactFacilitator() {
  const exact = {
    scheme: 'exact' as const,
    network: 'sui:mainnet' as const,
    signers: ['sui-fee-payer'],
    extra: { feePayer: 'sui-fee-payer' },
    verify: vi.fn(async () => ({ isValid: true, payer: `0x${'33'.repeat(32)}` })),
    settle: vi.fn(async () => ({
      success: true,
      transaction: 'sui-digest',
      network: 'sui:mainnet' as const,
    })),
  }
  const facilitator = createInteropFacilitator({
    intentsClient: new MockOneClickClient('exact-route'),
    store: new FileStore(join(mkdtempSync(join(tmpdir(), 'facil-exact-')), 'store.json')),
    exactAdapters: { 'sui:mainnet': exact },
  })
  return { facilitator, exact }
}

const quoteRequest = {
  sellerNetwork: 'near:mainnet',
  sellerAsset: NEAR_USDC,
  sellerAddress: 'seller.near',
  amount: '1000000',
  buyerNetwork: 'sui:mainnet',
  buyerAsset: SUI_USDC,
  buyerAddress: `0x${'22'.repeat(32)}`,
  deliveryMode: 'on_deposit',
}

describe('exact scheme routing', () => {
  it('advertises exact with signer metadata', async () => {
    const { facilitator } = exactFacilitator()
    const supported = await facilitator.routeFacilitator('GET', '/supported', undefined)

    expect(supported.status).toBe(200)
    expect(supported.body).toMatchObject({
      kinds: expect.arrayContaining([
        {
          x402Version: 2,
          scheme: 'exact',
          network: 'sui:mainnet',
          extra: { feePayer: 'sui-fee-payer' },
        },
      ]),
      signers: { 'sui:mainnet': ['sui-fee-payer'] },
    })
  })

  it('quotes origin-side exact requirements for Sui to NEAR', async () => {
    const { facilitator } = exactFacilitator()
    const response = await facilitator.routeFacilitator('POST', '/interop/quote', quoteRequest, {})

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      scheme: 'exact',
      network: 'sui:mainnet',
      asset: SUI_USDC,
      payTo: (response.body as Record<string, unknown>).depositAddress,
      extra: expect.objectContaining({
        feePayer: 'sui-fee-payer',
        sellerNetwork: 'near:mainnet',
        sellerAsset: NEAR_USDC,
      }),
    })
    const body = response.body as { amount: string; extra: { originAmount: string } }
    expect(body.amount).toBe(body.extra.originAmount)
  })

  it('routes verify and settle through the configured exact adapter', async () => {
    const { facilitator, exact } = exactFacilitator()
    const quoted = await facilitator.routeFacilitator('POST', '/interop/quote', quoteRequest, {})
    const requirements = quoted.body as Record<string, unknown>
    const body = {
      x402Version: 2,
      paymentRequirements: requirements,
      paymentPayload: {
        x402Version: 2,
        accepted: requirements,
        payload: {},
      },
    }

    expect(await facilitator.routeFacilitator('POST', '/verify', body, {})).toMatchObject({
      status: 200,
      body: { isValid: true },
    })
    expect(exact.verify).toHaveBeenCalledOnce()

    expect(await facilitator.routeFacilitator('POST', '/settle', body, {})).toMatchObject({
      status: 200,
      body: {
        success: true,
        transaction: 'sui-digest',
        extra: { deliveryMode: 'on_deposit', deliverable: true },
      },
    })
    expect(exact.settle).toHaveBeenCalledOnce()
  })

  it('marks on_success exact settlement as not deliverable yet', async () => {
    const { facilitator } = exactFacilitator()
    const quoted = await facilitator.routeFacilitator(
      'POST',
      '/interop/quote',
      { ...quoteRequest, deliveryMode: 'on_success' },
      {},
    )
    const requirements = quoted.body as Record<string, unknown>
    const settled = await facilitator.routeFacilitator(
      'POST',
      '/settle',
      {
        x402Version: 2,
        paymentRequirements: requirements,
        paymentPayload: { x402Version: 2, accepted: requirements, payload: {} },
      },
      {},
    )

    expect(settled).toMatchObject({
      status: 200,
      body: {
        success: true,
        extra: { deliveryMode: 'on_success', deliverable: false },
      },
    })
  })

  it('exposes refund status and address for a refunded quote', async () => {
    class RefundedClient extends MockOneClickClient {
      override async status(depositAddress: string) {
        return { status: 'REFUNDED' as const, depositAddress }
      }
    }
    const facilitator = createInteropFacilitator({
      intentsClient: new RefundedClient('refunded'),
      store: new FileStore(join(mkdtempSync(join(tmpdir(), 'facil-exact-')), 'store.json')),
    })
    const quoted = await facilitator.routeFacilitator('POST', '/interop/quote', quoteRequest, {})
    const quoteId = (quoted.body as { quoteId: string }).quoteId
    const status = await facilitator.routeFacilitator(
      'GET',
      `/interop/status/${quoteId}`,
      undefined,
    )

    expect(status).toMatchObject({
      status: 200,
      body: {
        state: 'refunded',
        deliverable: false,
        refundTo: quoteRequest.buyerAddress,
        refund: { status: 'refunded', automatic: true },
      },
    })
  })

  it('deduplicates supported kinds and omits an empty extra', async () => {
    const noExtra = {
      scheme: 'exact' as const,
      network: 'near:mainnet' as const,
      signers: ['near-relayer'],
      verify: async () => ({ isValid: true }),
      settle: async () => ({
        success: true,
        transaction: 'near-tx',
        network: 'near:mainnet' as const,
      }),
    }
    const facilitator = createInteropFacilitator({
      exactAdapters: { 'near:mainnet': noExtra },
      supportedKinds: () => [{ x402Version: 2, scheme: 'exact', network: 'near:mainnet' }],
    })
    const supported = await facilitator.routeFacilitator('GET', '/supported', undefined)
    const body = supported.body as {
      kinds: Array<{ scheme: string; network: string; extra?: unknown }>
    }
    const nearKinds = body.kinds.filter(
      (kind) => kind.scheme === 'exact' && kind.network === 'near:mainnet',
    )

    expect(nearKinds).toHaveLength(1)
    expect(nearKinds[0]?.extra).toBeUndefined()
  })

  it('fails closed when no exact adapter is configured for the network', async () => {
    const payload = { x402Version: 2, accepted: {}, payload: {} } as never
    const requirements: PaymentRequirements = {
      scheme: 'exact',
      network: 'sui:mainnet',
      asset: SUI_USDC,
      amount: '1',
      payTo: `0x${'44'.repeat(32)}`,
      maxTimeoutSeconds: 300,
      extra: {},
    }

    await expect(verifyWithAdapter(payload, requirements, {})).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'unsupported_scheme',
    })
    await expect(settleWithAdapter(payload, requirements, {})).resolves.toMatchObject({
      success: false,
      errorReason: 'unsupported_scheme',
    })
    await expect(verifyWithAdapter(payload, requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'unsupported_scheme',
    })
    await expect(settleWithAdapter(payload, requirements)).resolves.toMatchObject({
      success: false,
      errorReason: 'unsupported_scheme',
    })

    const unknown = { ...requirements, scheme: 'unknown-scheme' }
    await expect(verifyWithAdapter(payload, unknown, {})).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'unsupported_scheme',
    })
    await expect(settleWithAdapter(payload, unknown, {})).resolves.toMatchObject({
      success: false,
      errorReason: 'unsupported_scheme',
    })
  })

  it('turns Error exceptions into fail-closed responses', async () => {
    const payload = { x402Version: 2, accepted: {}, payload: {} } as never
    const requirements: PaymentRequirements = {
      scheme: 'exact',
      network: 'sui:mainnet',
      asset: SUI_USDC,
      amount: '1',
      payTo: `0x${'44'.repeat(32)}`,
      maxTimeoutSeconds: 300,
      extra: {},
    }
    const failing = {
      scheme: 'exact' as const,
      network: 'sui:mainnet' as const,
      signers: [],
      verify: async () => {
        throw new Error('verify error')
      },
      settle: async () => {
        throw new Error('settle error')
      },
    }

    await expect(
      verifyWithAdapter(payload, requirements, { 'sui:mainnet': failing }),
    ).resolves.toMatchObject({ isValid: false, invalidMessage: 'verify error' })
    await expect(
      settleWithAdapter(payload, requirements, { 'sui:mainnet': failing }),
    ).resolves.toMatchObject({ success: false, errorMessage: 'settle error' })
  })

  it('turns exact adapter exceptions into fail-closed responses', async () => {
    const payload = { x402Version: 2, accepted: {}, payload: {} } as never
    const requirements: PaymentRequirements = {
      scheme: 'exact',
      network: 'sui:mainnet',
      asset: SUI_USDC,
      amount: '1',
      payTo: `0x${'44'.repeat(32)}`,
      maxTimeoutSeconds: 300,
      extra: {},
    }
    const failing = {
      scheme: 'exact' as const,
      network: 'sui:mainnet' as const,
      signers: [],
      verify: async () => {
        throw 'verify down'
      },
      settle: async () => {
        throw 'settle down'
      },
    }

    await expect(
      verifyWithAdapter(payload, requirements, { 'sui:mainnet': failing }),
    ).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'unexpected_error',
      invalidMessage: 'verify down',
    })
    await expect(
      settleWithAdapter(payload, requirements, { 'sui:mainnet': failing }),
    ).resolves.toMatchObject({
      success: false,
      errorReason: 'unexpected_error',
      errorMessage: 'settle down',
    })
  })
})
