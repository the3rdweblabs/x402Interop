// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  SCHEME_IDS,
  X402_VERSION,
  interopEvmTypedData,
  type PaymentPayload,
  type PaymentRequirements,
} from '@x402interop/core'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import { settleInterop, verifyInterop } from '../src/evm/interop.js'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const DEPOSIT = '0x1111111111111111111111111111111111111111'
const ORIGIN_ASSET = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const TX_HASH = `0x${'ab'.repeat(32)}`
const EXPIRES_AT = '2030-01-01T00:00:00.000Z'
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
    extra: { quoteId: 'quote-1', depositAddress: DEPOSIT, expiresAt: EXPIRES_AT },
    ...overrides,
  }
}

const binding = {
  quoteId: 'quote-1',
  depositAddress: DEPOSIT,
  nonce: 'nonce-1',
  expiresAt: EXPIRES_AT,
}

async function signedPayload(
  overrides: {
    binding?: Record<string, unknown>
    authorization?: Record<string, unknown>
    requirements?: Partial<PaymentRequirements>
  } = {},
): Promise<{ payload: PaymentPayload; requirements: PaymentRequirements }> {
  const req = requirements(overrides.requirements)
  const bound = { ...binding, ...overrides.binding }
  const originNetwork = (overrides.authorization?.originNetwork as string) ?? 'eip155:8453'
  const originAsset = (overrides.authorization?.originAsset as string) ?? ORIGIN_ASSET
  const originAmount = (overrides.authorization?.originAmount as string) ?? '222270'
  const typed = interopEvmTypedData(
    {
      quoteId: String(bound.quoteId),
      depositAddress: String(bound.depositAddress) as `0x${string}`,
      originNetwork,
      originAsset,
      originAmount: BigInt(originAmount),
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
    originNetwork,
    originAsset,
    originAmount,
    ...overrides.authorization,
  }
  return {
    requirements: req,
    payload: {
      x402Version: X402_VERSION,
      accepted: req,
      payload: { binding: bound, authorization },
    },
  }
}

describe.skipIf(!HAS_TEST_KEY)('EVM interop proof verification', () => {
  it('recovers the buyer from a valid EIP-712 binding', async () => {
    const { payload, requirements: req } = await signedPayload()

    await expect(verifyInterop(payload, req)).resolves.toMatchObject({
      isValid: true,
      payer: account.address,
      extra: { txHash: TX_HASH, quoteId: 'quote-1', depositAddress: DEPOSIT },
    })
  })

  it('rejects a payload whose signed origin amount was changed', async () => {
    const { payload, requirements: req } = await signedPayload()
    ;(payload.payload as any).authorization.originAmount = '999999'

    await expect(verifyInterop(payload, req)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'invalid_signature',
    })
  })

  it('rejects a signature that recovers to another address', async () => {
    const { payload, requirements: req } = await signedPayload({
      authorization: { from: '0x2222222222222222222222222222222222222222' },
    })

    await expect(verifyInterop(payload, req)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'invalid_signature',
    })
  })

  it('requires both a transaction hash and a signature', async () => {
    const onlyHash = await signedPayload({ authorization: { signature: undefined } })
    await expect(verifyInterop(onlyHash.payload, onlyHash.requirements)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'invalid_binding',
    })

    const onlySignature = await signedPayload({ authorization: { txHash: undefined } })
    await expect(
      verifyInterop(onlySignature.payload, onlySignature.requirements),
    ).resolves.toMatchObject({ isValid: false, invalidReason: 'invalid_binding' })
  })

  it('rejects malformed transaction hashes and origin terms', async () => {
    for (const authorization of [
      { txHash: '0x1234' },
      { originNetwork: 'sui:mainnet' },
      { from: 'not-an-address' },
      { originAsset: '' },
    ]) {
      const { payload, requirements: req } = await signedPayload({ authorization })
      await expect(verifyInterop(payload, req)).resolves.toMatchObject({
        isValid: false,
        invalidReason: 'invalid_binding',
      })
    }

    const { payload, requirements: req } = await signedPayload()
    ;(payload.payload as any).authorization.originAmount = '1.5'
    await expect(verifyInterop(payload, req)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'invalid_binding',
    })
  })

  it('rejects a signature that cannot be recovered', async () => {
    const { payload, requirements: req } = await signedPayload({
      authorization: { signature: '0xdeadbeef' },
    })

    await expect(verifyInterop(payload, req)).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'invalid_signature',
    })
  })

  it('fails closed without a binding or origin proof', async () => {
    const req = requirements()
    await expect(
      verifyInterop({ x402Version: X402_VERSION, accepted: req, payload: {} }, req),
    ).resolves.toMatchObject({ isValid: false, invalidReason: 'not_implemented' })

    await expect(
      verifyInterop({ x402Version: X402_VERSION, accepted: req, payload: { binding } }, req),
    ).resolves.toMatchObject({ isValid: false, invalidReason: 'not_implemented' })
  })

  it('rejects a scheme mismatch and malformed recipients', async () => {
    const { payload, requirements: req } = await signedPayload()

    await expect(verifyInterop(payload, { ...req, scheme: SCHEME_IDS.sui })).resolves.toMatchObject(
      { isValid: false, invalidReason: 'scheme_mismatch' },
    )

    await expect(verifyInterop(payload, { ...req, payTo: '0x123' })).resolves.toMatchObject({
      isValid: false,
      invalidReason: 'invalid_recipient',
    })

    await expect(
      verifyInterop(
        {
          ...payload,
          payload: { ...payload.payload, binding: { ...binding, depositAddress: '0x123' } },
        },
        req,
      ),
    ).resolves.toMatchObject({ isValid: false, invalidReason: 'invalid_binding' })
  })

  it('settles a valid proof with the origin transaction hash', async () => {
    const { payload, requirements: req } = await signedPayload()

    await expect(settleInterop(payload, req)).resolves.toMatchObject({
      success: true,
      transaction: TX_HASH,
      network: 'sui:mainnet',
      payer: account.address,
    })
  })

  it('refuses to settle an invalid proof', async () => {
    const { payload, requirements: req } = await signedPayload()
    ;(payload.payload as any).authorization.originAmount = '999999'

    await expect(settleInterop(payload, req)).resolves.toMatchObject({
      success: false,
      errorReason: 'invalid_signature',
      transaction: '',
    })
  })

  it('does not settle an unproven interop binding', async () => {
    const req = requirements()
    await expect(
      settleInterop({ x402Version: X402_VERSION, accepted: req, payload: { binding } }, req),
    ).resolves.toMatchObject({
      success: false,
      errorReason: 'not_implemented',
      transaction: '',
    })
  })
})
