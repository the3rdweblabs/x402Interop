// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildEvmPaymentPayload } from '../../client/src/evm-signer.js'
import { X402_VERSION } from '@x402interop/core'
import {
  MockOneClickClient,
  SimulatorOneClickClient,
  type OneClickClient,
  type OneClickDepositAck,
  type OneClickQuote,
  type OneClickStatus,
} from '@x402interop/intents'
import { afterEach, describe, expect, it } from 'vitest'

import { createInteropFacilitator } from '../src/facilitator.js'
import { FileStore } from '../src/store.js'
import { privateKeyToAccount } from 'viem/accounts'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const KEY = testPrivateKeyOrPlaceholder()
const HAS_TEST_KEY = hasTestPrivateKey()

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function facilitatorFor(client?: OneClickClient) {
  const dir = mkdtempSync(join(tmpdir(), 'facil-sim-'))
  dirs.push(dir)
  return createInteropFacilitator({
    ...(client ? { intentsClient: client } : {}),
    store: new FileStore(join(dir, 'store.json')),
  })
}

const quoteRequest = {
  sellerNetwork: 'sui:mainnet',
  sellerAsset: 'usdc',
  sellerAddress: 'seller',
  amount: '50000',
  buyerNetwork: 'eip155:8453',
  buyerAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  buyerAddress: privateKeyToAccount(KEY).address,
  deliveryMode: 'on_deposit' as const,
}

async function signedBody(quote: Record<string, any>) {
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
  return {
    txHash,
    body: {
      x402Version: X402_VERSION,
      paymentRequirements: requirements,
      paymentPayload: {
        x402Version: X402_VERSION,
        accepted: requirements,
        payload: signed.payload,
      },
    },
  }
}

class RejectingSimulator extends MockOneClickClient {
  override async submitDeposit(): Promise<OneClickDepositAck> {
    return { accepted: false }
  }
}

describe('simulated deposits', () => {
  it.skipIf(!HAS_TEST_KEY)(
    'advances a signed mock payment to SUCCESS over the facilitator routes',
    async () => {
      const facilitator = facilitatorFor(new MockOneClickClient('route-mock'))
      const quoted = await facilitator.routeFacilitator('POST', '/interop/quote', quoteRequest)
      expect(quoted.status).toBe(200)
      const quote = quoted.body as Record<string, any>
      const { body } = await signedBody(quote)

      const verified = await facilitator.routeFacilitator('POST', '/verify', body)
      expect(verified.body).toMatchObject({ isValid: true, extra: { swapStatus: 'SUCCESS' } })
      const settled = await facilitator.routeFacilitator('POST', '/settle', body)
      expect(settled.body).toMatchObject({ success: true })
      const status = await facilitator.routeFacilitator(
        'GET',
        `/interop/status/${quote.quoteId}`,
        undefined,
      )
      expect(status.body).toMatchObject({ state: 'success' })
      const replay = await facilitator.routeFacilitator('POST', '/settle', body)
      expect(replay.body).toMatchObject({ invalidReason: 'nonce_reused' })
    },
  )

  it('accepts an explicit simulator deposit and ignores unknown quotes', async () => {
    const facilitator = facilitatorFor(new SimulatorOneClickClient('route-sim'))
    const quoted = await facilitator.routeFacilitator('POST', '/interop/quote', quoteRequest)
    const quote = quoted.body as { quoteId: string }
    const txHash = `0x${'cd'.repeat(32)}`
    expect(
      await facilitator.routeFacilitator('GET', '/interop/simulate/deposit', undefined),
    ).toMatchObject({ status: 405 })
    expect(
      await facilitator.routeFacilitator('POST', '/interop/simulate/deposit', {
        quoteId: quote.quoteId,
      }),
    ).toMatchObject({ status: 400 })
    expect(
      await facilitator.routeFacilitator('POST', '/interop/simulate/deposit', {
        quoteId: 'missing',
        txHash,
      }),
    ).toMatchObject({ status: 404 })
    const advanced = await facilitator.routeFacilitator('POST', '/interop/simulate/deposit', {
      quoteId: quote.quoteId,
      txHash,
    })
    expect(advanced.status).toBe(200)
    expect(advanced.body).toMatchObject({ accepted: true, txHash })
    const status = await facilitator.routeFacilitator(
      'GET',
      `/interop/status/${quote.quoteId}`,
      undefined,
    )
    expect(status.body).toMatchObject({ state: 'success', originTxHash: txHash })
  })

  it.skipIf(!HAS_TEST_KEY)('does not expose the simulator route on a live client', async () => {
    let submitted = false
    const live: OneClickClient = {
      async quote(request): Promise<OneClickQuote> {
        return {
          quoteId: 'live-quote',
          depositAddress: '0x2222222222222222222222222222222222222222',
          originAmount: request.amount,
          destinationAmount: request.amount,
          timeEstimateSeconds: 30,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }
      },
      async status(depositAddress: string): Promise<OneClickStatus> {
        return { status: 'PENDING_DEPOSIT', depositAddress }
      },
      async submitDeposit(): Promise<OneClickDepositAck> {
        submitted = true
        return { accepted: true }
      },
    }
    const facilitator = facilitatorFor(live)
    expect(
      await facilitator.routeFacilitator('POST', '/interop/simulate/deposit', {
        quoteId: 'live-quote',
        txHash: `0x${'ab'.repeat(32)}`,
      }),
    ).toMatchObject({ status: 404, body: { error: 'not_found' } })
    const quoted = await facilitator.routeFacilitator('POST', '/interop/quote', quoteRequest)
    const { body } = await signedBody(quoted.body as Record<string, any>)
    const verified = await facilitator.routeFacilitator('POST', '/verify', body)
    expect(verified.body).toMatchObject({ isValid: false, invalidReason: 'payment_not_found' })
    expect(submitted).toBe(false)
  })

  it.skipIf(!HAS_TEST_KEY)(
    'leaves the deposit pending when the simulator rejects it or the quote is unknown',
    async () => {
      const facilitator = facilitatorFor(new RejectingSimulator('reject'))
      const quoted = await facilitator.routeFacilitator('POST', '/interop/quote', quoteRequest)
      const quote = quoted.body as Record<string, any>
      const { body } = await signedBody(quote)
      expect((await facilitator.routeFacilitator('POST', '/verify', body)).body).toMatchObject({
        invalidReason: 'payment_not_found',
      })
      expect(
        await facilitator.routeFacilitator('POST', '/interop/simulate/deposit', {
          quoteId: quote.quoteId,
          txHash: `0x${'ef'.repeat(32)}`,
        }),
      ).toMatchObject({ status: 409 })

      const outsider = facilitatorFor(new MockOneClickClient('outsider'))
      const foreign = {
        ...quote,
        quoteId: 'not-minted-here',
        depositAddress: '0x3333333333333333333333333333333333333333',
        payTo: '0x3333333333333333333333333333333333333333',
        extra: {
          ...quote.extra,
          quoteId: 'not-minted-here',
          depositAddress: '0x3333333333333333333333333333333333333333',
        },
      }
      const signed = await signedBody(foreign)
      expect((await outsider.routeFacilitator('POST', '/verify', signed.body)).body).toMatchObject({
        invalidReason: 'payment_not_found',
      })
    },
  )

  it('rejects a quote body that is not a quote request', async () => {
    const facilitator = facilitatorFor(new MockOneClickClient('bad-quote'))
    expect(await facilitator.routeFacilitator('POST', '/interop/quote', {})).toMatchObject({
      status: 400,
      body: { error: 'invalid_request' },
    })
  })
})
