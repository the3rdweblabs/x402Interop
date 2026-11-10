// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  SCHEME_IDS,
  X402_VERSION,
  interopEvmTypedData,
  type PaymentRequirements,
  type SettleRequest,
  type VerifyRequest,
} from '@x402interop/core'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'

import { settlePayment, verifyPayment, type InteropStatusLookup } from '../src/index.js'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const now = new Date('2029-01-01T00:00:00Z')
const EXPIRES_AT = '2030-01-01T00:00:00.000Z'
const DEPOSIT = '0x1111111111111111111111111111111111111111'
const ORIGIN_ASSET = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const TX_HASH = `0x${'ab'.repeat(32)}`
const TEST_KEY = testPrivateKeyOrPlaceholder()
const HAS_TEST_KEY = hasTestPrivateKey()

const account = privateKeyToAccount(TEST_KEY)

function requirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: SCHEME_IDS.evm,
    network: 'sui:mainnet',
    asset: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    amount: '200000',
    payTo: DEPOSIT,
    maxTimeoutSeconds: 300,
    extra: {
      quoteId: 'quote-1',
      depositAddress: DEPOSIT,
      originNetwork: 'eip155:8453',
      originAsset: ORIGIN_ASSET,
      originAmount: '222270',
      expiresAt: EXPIRES_AT,
    },
    ...overrides,
  }
}

const binding = {
  quoteId: 'quote-1',
  depositAddress: DEPOSIT,
  nonce: 'nonce-1',
  expiresAt: EXPIRES_AT,
  originNetwork: 'eip155:8453',
  originAsset: ORIGIN_ASSET,
  originAmount: '222270',
}

async function signedRequest(
  overrides: {
    requirements?: Partial<PaymentRequirements>
    binding?: Record<string, unknown>
    authorization?: Record<string, unknown>
    scheme?: string
  } = {},
): Promise<VerifyRequest> {
  const req = requirements(overrides.requirements)
  const bound = { ...binding, ...overrides.binding }
  const typed = interopEvmTypedData(
    {
      quoteId: String(bound.quoteId),
      depositAddress: String(bound.depositAddress) as `0x${string}`,
      originNetwork: String(bound.originNetwork),
      originAsset: String(bound.originAsset),
      originAmount: BigInt(String(bound.originAmount)),
      nonce: String(bound.nonce),
      expiresAt: String(bound.expiresAt),
    },
    8453,
  )
  const signature = await account.signTypedData({
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
  })
  const authorization = {
    from: account.address,
    to: DEPOSIT,
    amount: '222270',
    txHash: TX_HASH,
    signature,
    originNetwork: 'eip155:8453',
    originAsset: ORIGIN_ASSET,
    originAmount: '222270',
    ...overrides.authorization,
  }
  const scheme = overrides.scheme ?? SCHEME_IDS.evm
  const shaped = { ...req, scheme }
  return {
    x402Version: X402_VERSION,
    paymentRequirements: shaped,
    paymentPayload: {
      x402Version: X402_VERSION,
      accepted: { ...shaped, scheme },
      payload: { binding: bound, authorization },
    },
  }
}

function statusClient(
  status: string,
  detail: Partial<Awaited<ReturnType<InteropStatusLookup['status']>>> = {},
): InteropStatusLookup & { status: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(async (depositAddress: string) => ({
    status,
    depositAddress,
    ...detail,
  }))
  return { status: fn }
}

describe.skipIf(!HAS_TEST_KEY)('interop deposit status verification', () => {
  it('accepts a signed EVM payload once 1Click reports SUCCESS', async () => {
    const req = await signedRequest()
    const originTxHash = `0x${'cd'.repeat(32)}`
    const lookup = statusClient('SUCCESS', { originTxHash, destinationTxHash: '0xdest' })

    const result = await verifyPayment(req, now, { interopStatus: lookup })

    expect(result).toMatchObject({
      isValid: true,
      payer: account.address,
      extra: {
        swapStatus: 'SUCCESS',
        depositAddress: DEPOSIT,
        quoteId: 'quote-1',
        originTxHash,
        destinationTxHash: '0xdest',
      },
    })
    expect(lookup.status).toHaveBeenCalledWith(DEPOSIT)
  })

  it('forwards the quote deposit memo to the status lookup', async () => {
    const req = await signedRequest({
      requirements: {
        extra: {
          ...requirements().extra,
          depositMemo: 'memo-1',
        },
      },
    })
    const lookup = statusClient('SUCCESS')

    await verifyPayment(req, now, { interopStatus: lookup })

    expect(lookup.status).toHaveBeenCalledWith(DEPOSIT, 'memo-1')
  })

  it('accepts on_deposit once the origin deposit is seen', async () => {
    const req = await signedRequest()

    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('KNOWN_DEPOSIT_TX') }),
    ).resolves.toMatchObject({
      isValid: true,
      extra: { deliverable: true, deliveryMode: 'on_deposit' },
    })
    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('PROCESSING') }),
    ).resolves.toMatchObject({
      isValid: true,
      extra: { deliverable: true, deliveryMode: 'on_deposit' },
    })
    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('PENDING_DEPOSIT') }),
    ).resolves.toMatchObject({ isValid: false, invalidReason: 'payment_not_found' })
    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('REFUNDED') }),
    ).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'payment_failed',
      extra: { refund: { status: 'refunded', automatic: true } },
    })
    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('FAILED') }),
    ).resolves.toMatchObject({ isValid: false, invalidReason: 'payment_failed' })
  })

  it('marks pending_push as not deliverable until SUCCESS', async () => {
    const req = await signedRequest({
      requirements: {
        extra: { ...requirements().extra, deliveryMode: 'pending_push' },
      },
    })

    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('PROCESSING') }),
    ).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'payment_pending',
      extra: { deliverable: false, pendingPush: true, deliveryMode: 'pending_push' },
    })
  })

  it('waits for SUCCESS with on_success delivery', async () => {
    const req = await signedRequest({
      requirements: {
        extra: { ...requirements().extra, deliveryMode: 'on_success' },
      },
    })

    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('KNOWN_DEPOSIT_TX') }),
    ).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'payment_pending',
      extra: { deliverable: false, deliveryMode: 'on_success' },
    })
    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('SUCCESS') }),
    ).resolves.toMatchObject({
      isValid: true,
      extra: { deliverable: true, deliveryMode: 'on_success' },
    })
  })

  it('fails closed when the settlement status cannot be read', async () => {
    const req = await signedRequest()
    const lookup: InteropStatusLookup = {
      status: async () => {
        throw new Error('upstream down')
      },
    }
    await expect(verifyPayment(req, now, { interopStatus: lookup })).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'status_unavailable',
    })
  })

  it('requires an EVM proof before trusting a deposit status', async () => {
    const req = await signedRequest({ authorization: { signature: undefined } })
    const lookup = statusClient('SUCCESS')

    const result = await verifyPayment(req, now, { interopStatus: lookup })

    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('invalid_binding')
    expect(lookup.status).not.toHaveBeenCalled()
  })

  it('rejects a tampered EVM proof before reading the deposit status', async () => {
    const req = await signedRequest({ authorization: { originAmount: '999999' } })
    const lookup = statusClient('SUCCESS')

    const result = await verifyPayment(req, now, { interopStatus: lookup })

    expect(result).toMatchObject({ isValid: false, invalidReason: 'invalid_signature' })
    expect(lookup.status).not.toHaveBeenCalled()
  })

  it('rejects a signature that recovers to a different payer', async () => {
    const req = await signedRequest({
      authorization: { from: '0x2222222222222222222222222222222222222222' },
    })
    const lookup = statusClient('SUCCESS')

    await expect(verifyPayment(req, now, { interopStatus: lookup })).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'invalid_signature',
    })
    expect(lookup.status).not.toHaveBeenCalled()
  })

  it('only trusts payTo when it matches the bound deposit address', async () => {
    const req = await signedRequest({
      requirements: { payTo: '0x2222222222222222222222222222222222222222' },
    })

    await expect(
      verifyPayment(req, now, { interopStatus: statusClient('SUCCESS') }),
    ).resolves.toMatchObject({ isValid: false, invalidReason: 'invalid_binding' })
  })

  it('allows non-EVM families to settle from the deposit status alone', async () => {
    const req = await signedRequest({ scheme: SCHEME_IDS.sui })
    const lookup = statusClient('SUCCESS')

    await expect(verifyPayment(req, now, { interopStatus: lookup })).resolves.toMatchObject({
      isValid: true,
      extra: { swapStatus: 'SUCCESS', originTxHash: TX_HASH },
    })
  })

  it('accepts a top-level binding for non-EVM families and omits an unknown payer', async () => {
    const base = await signedRequest({ scheme: SCHEME_IDS.sui })
    const req = {
      ...base,
      paymentPayload: {
        ...base.paymentPayload,
        payload: { authorization: { txHash: TX_HASH } },
        binding,
      },
    } as VerifyRequest

    const verified = await verifyPayment(req, now, { interopStatus: statusClient('SUCCESS') })
    expect(verified).toMatchObject({
      isValid: true,
      extra: { swapStatus: 'SUCCESS', originTxHash: TX_HASH },
    })
    expect(verified.payer).toBeUndefined()

    const settled = await settlePayment(req as SettleRequest, now, {
      interopStatus: statusClient('SUCCESS'),
    })
    expect(settled).toMatchObject({ success: true, transaction: TX_HASH, amount: '200000' })
    expect(settled.payer).toBeUndefined()
  })

  it('leaves non-interop schemes to the adapter registry', async () => {
    const base = await signedRequest()
    const exact = {
      ...base,
      paymentRequirements: { ...base.paymentRequirements, scheme: 'exact' },
      paymentPayload: {
        ...base.paymentPayload,
        accepted: { ...base.paymentPayload.accepted, scheme: 'exact' },
      },
    } as VerifyRequest

    expect((await verifyPayment(exact, now)).invalidReason).toBe('unsupported_scheme')
  })

  it('settles only after SUCCESS and exposes the origin transaction', async () => {
    const req = (await signedRequest()) as SettleRequest
    const originTxHash = `0x${'ef'.repeat(32)}`

    const settled = await settlePayment(req, now, {
      interopStatus: statusClient('SUCCESS', { originTxHash }),
    })

    expect(settled).toMatchObject({
      success: true,
      transaction: originTxHash,
      network: 'sui:mainnet',
      payer: account.address,
      amount: '200000',
      extra: { swapStatus: 'SUCCESS' },
    })
  })

  it('settles on_deposit once the deposit is seen', async () => {
    const req = (await signedRequest()) as SettleRequest
    const result = await settlePayment(req, now, {
      interopStatus: statusClient('KNOWN_DEPOSIT_TX'),
    })

    expect(result).toMatchObject({
      success: true,
      extra: { deliverable: true, deliveryMode: 'on_deposit' },
    })
  })

  it('refuses on_success settlement while the swap is pending', async () => {
    const req = (await signedRequest({
      requirements: {
        extra: { ...requirements().extra, deliveryMode: 'on_success' },
      },
    })) as SettleRequest
    const result = await settlePayment(req, now, {
      interopStatus: statusClient('KNOWN_DEPOSIT_TX'),
    })

    expect(result).toMatchObject({
      success: false,
      errorReason: 'payment_pending',
      transaction: '',
    })
  })

  it('records a simulated deposit only after the EVM proof verifies', async () => {
    const req = await signedRequest()
    const recordSimulatedDeposit = vi.fn(async () => undefined)
    const lookup = statusClient('SUCCESS')
    await expect(
      verifyPayment(req, now, { interopStatus: lookup, recordSimulatedDeposit }),
    ).resolves.toMatchObject({ isValid: true })
    expect(recordSimulatedDeposit).toHaveBeenCalledWith({
      depositAddress: DEPOSIT,
      txHash: TX_HASH,
    })

    const forged = await signedRequest()
    const authorization = forged.paymentPayload.payload as { authorization: { signature: string } }
    authorization.authorization.signature = `0x${'11'.repeat(65)}`
    const skipped = vi.fn(async () => undefined)
    const rejected = await verifyPayment(forged, now, {
      interopStatus: statusClient('SUCCESS'),
      recordSimulatedDeposit: skipped,
    })
    expect(rejected.isValid).toBe(false)
    expect(skipped).not.toHaveBeenCalled()

    recordSimulatedDeposit.mockRejectedValueOnce(new Error('disk full'))
    await expect(
      verifyPayment(req, now, { interopStatus: lookup, recordSimulatedDeposit }),
    ).resolves.toMatchObject({ invalidReason: 'status_unavailable' })
  })
})
