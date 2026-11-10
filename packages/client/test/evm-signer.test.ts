// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { interopEvmTypedData, type PaymentRequirements } from '@x402interop/core'
import { recoverTypedDataAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildEvmPaymentPayload, sendEvmPayment } from '../src/index.js'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const mocks = vi.hoisted(() => ({
  createWalletClient: vi.fn(),
  sendTransaction: vi.fn(),
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return { ...actual, createWalletClient: mocks.createWalletClient }
})

const TEST_KEY = testPrivateKeyOrPlaceholder()
const HAS_TEST_KEY = hasTestPrivateKey()
const ACCOUNT = privateKeyToAccount(TEST_KEY)
const DEPOSIT = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const TX_HASH = `0x${'ab'.repeat(32)}` as `0x${string}`
const BINDING = {
  quoteId: 'quote-1',
  depositAddress: DEPOSIT,
  nonce: 'nonce-1',
  expiresAt: '2030-01-01T00:00:00.000Z',
  originNetwork: 'eip155:8453',
  originAsset: TOKEN,
  originAmount: '222270',
}

const REQUIREMENTS: PaymentRequirements = {
  scheme: 'x402interop-evm',
  network: 'sui:mainnet',
  asset: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  amount: '200000',
  payTo: DEPOSIT,
  maxTimeoutSeconds: 300,
  extra: { quoteId: 'quote-1', depositAddress: DEPOSIT },
}

describe.skipIf(!HAS_TEST_KEY)('buildEvmPaymentPayload', () => {
  it('signs the quote binding with EIP-712', async () => {
    const built = await buildEvmPaymentPayload(
      {
        privateKey: TEST_KEY,
        depositAddress: DEPOSIT,
        amount: '222270',
        tokenAddress: TOKEN,
      },
      BINDING,
    )

    const authorization = (built.payload as any).authorization
    expect(authorization).toMatchObject({
      from: ACCOUNT.address,
      to: DEPOSIT,
      token: TOKEN,
      amount: '222270',
      originNetwork: 'eip155:8453',
      originAsset: TOKEN,
      originAmount: '222270',
    })
    expect(authorization.txHash).toBeNull()
    expect(built.payload.binding).toMatchObject(BINDING)

    const recovered = await recoverTypedDataAddress({
      ...interopEvmTypedData(
        {
          quoteId: 'quote-1',
          depositAddress: DEPOSIT as `0x${string}`,
          originNetwork: 'eip155:8453',
          originAsset: TOKEN,
          originAmount: 222270n,
          nonce: 'nonce-1',
          expiresAt: BINDING.expiresAt,
        },
        8453,
      ),
      signature: authorization.signature,
    })
    expect(recovered).toBe(ACCOUNT.address)
  })

  it('defaults the origin terms from the payment parameters', async () => {
    const built = await buildEvmPaymentPayload(
      {
        privateKey: TEST_KEY,
        depositAddress: DEPOSIT,
        amount: '1000',
        tokenAddress: TOKEN,
        txHash: TX_HASH,
      },
      {
        quoteId: 'quote-2',
        depositAddress: DEPOSIT,
        nonce: 'nonce-2',
        expiresAt: BINDING.expiresAt,
      },
    )

    expect((built.payload as any).authorization).toMatchObject({
      value: '0',
      txHash: TX_HASH,
      originNetwork: 'eip155:8453',
      originAsset: TOKEN,
      originAmount: '1000',
    })
  })

  it('refuses a non-integer origin amount', async () => {
    await expect(
      buildEvmPaymentPayload(
        {
          privateKey: TEST_KEY,
          depositAddress: DEPOSIT,
          amount: '1.5',
        },
        {
          quoteId: 'quote-1',
          depositAddress: DEPOSIT,
          nonce: 'nonce-1',
          expiresAt: BINDING.expiresAt,
        },
      ),
    ).rejects.toThrow('originAmount must be an atomic integer string')
  })
})

describe.skipIf(!HAS_TEST_KEY)('sendEvmPayment', () => {
  beforeEach(() => {
    mocks.sendTransaction.mockReset()
    mocks.createWalletClient.mockReset()
    mocks.sendTransaction.mockResolvedValue(TX_HASH)
    mocks.createWalletClient.mockReturnValue({
      sendTransaction: mocks.sendTransaction,
    })
  })

  it('broadcasts a native transfer and signs the returned hash', async () => {
    const result = await sendEvmPayment({
      privateKey: TEST_KEY,
      depositAddress: DEPOSIT,
      amount: '222270',
      quoteId: 'quote-1',
      nonce: 'nonce-1',
      expiresAt: BINDING.expiresAt,
      accepted: REQUIREMENTS,
      originNetwork: 'eip155:8453',
      originAsset: 'native',
      originAmount: '222270',
    })

    expect(mocks.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ to: DEPOSIT, value: 222270n }),
    )
    expect(result.txHash).toBe(TX_HASH)
    expect(result.paymentPayload.accepted).toEqual(REQUIREMENTS)
    expect((result.paymentPayload.payload as any).authorization).toMatchObject({
      txHash: TX_HASH,
      from: ACCOUNT.address,
      originAsset: 'native',
    })
  })

  it('broadcasts an ERC-20 transfer to the deposit address', async () => {
    const result = await sendEvmPayment({
      privateKey: TEST_KEY,
      depositAddress: DEPOSIT,
      amount: '222270',
      tokenAddress: TOKEN,
      quoteId: 'quote-1',
      nonce: 'nonce-1',
      expiresAt: BINDING.expiresAt,
      accepted: REQUIREMENTS,
    })

    expect(mocks.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: TOKEN,
        data: expect.stringMatching(/^0xa9059cbb/),
      }),
    )
    expect((result.paymentPayload.payload as any).authorization.originAsset).toBe(TOKEN)
  })
})
