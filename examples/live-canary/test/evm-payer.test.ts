// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PaymentRequirements } from '@x402interop/core'

import { resolveCanaryAsset } from '../src/assets.js'
import { chainIdFor, evmChainFor, payEvmOrigin } from '../src/evm-payer.js'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const mocks = vi.hoisted(() => ({
  sendEvmPayment: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  createPublicClient: vi.fn(),
}))

vi.mock('@x402interop/client', () => ({
  sendEvmPayment: mocks.sendEvmPayment,
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return { ...actual, createPublicClient: mocks.createPublicClient }
})

const USDC = resolveCanaryAsset('eip155:8453', 'USDC')
const TX_HASH = `0x${'cd'.repeat(32)}` as `0x${string}`
const DEPOSIT = `0x${'ab'.repeat(20)}`
const TEST_KEY = testPrivateKeyOrPlaceholder()
const HAS_TEST_KEY = hasTestPrivateKey()
const REQUIREMENTS: PaymentRequirements = {
  scheme: 'x402interop-evm',
  network: 'sui:mainnet',
  asset: '0x2::usdc::USDC',
  amount: '200000',
  payTo: DEPOSIT,
  maxTimeoutSeconds: 300,
  extra: { quoteId: 'quote-1', depositAddress: DEPOSIT },
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    privateKey: TEST_KEY as `0x${string}`,
    originNetwork: 'eip155:8453',
    asset: USDC,
    amount: '222270',
    depositAddress: DEPOSIT,
    quoteId: 'quote-1',
    nonce: 'nonce-1',
    expiresAt: '2026-11-02T12:30:00.000Z',
    requirements: REQUIREMENTS,
    ...overrides,
  }
}

describe('chainIdFor', () => {
  it('reads the chain id from a CAIP-2 EVM network', () => {
    expect(chainIdFor('eip155:8453')).toBe(8453)
    expect(chainIdFor('eip155:1')).toBe(1)
  })

  it('fails closed for non-EVM and malformed ids', () => {
    expect(() => chainIdFor('sui:mainnet')).toThrow(/not an EVM network/)
    expect(() => chainIdFor('eip155:base')).toThrow(/not an EVM network/)
    expect(() => chainIdFor('eip155')).toThrow(/not an EVM network/)
  })
})

describe('evmChainFor', () => {
  it('uses the built-in viem definition for catalogue chains', () => {
    expect(evmChainFor('eip155:8453').id).toBe(8453)
    expect(evmChainFor('eip155:8453').name).toBe('Base')
    expect(evmChainFor('eip155:42161').name).toBe('Arbitrum One')
  })

  it('builds a chain from an explicit RPC for an unknown EVM network', () => {
    const chain = evmChainFor('eip155:7777', 'https://rpc.example.invalid')
    expect(chain.id).toBe(7777)
    expect(chain.name).toBe('eip155:7777')
    expect(chain.rpcUrls.default.http).toEqual(['https://rpc.example.invalid'])
  })

  it('requires an RPC for an unknown EVM network', () => {
    expect(() => evmChainFor('eip155:7777')).toThrow(/CANARY_ORIGIN_RPC_URL/)
  })
})

describe.skipIf(!HAS_TEST_KEY)('payEvmOrigin', () => {
  beforeEach(() => {
    mocks.sendEvmPayment.mockReset()
    mocks.waitForTransactionReceipt.mockReset()
    mocks.createPublicClient.mockReset()
    mocks.sendEvmPayment.mockResolvedValue({
      txHash: TX_HASH,
      paymentPayload: { x402Version: 2, payload: { txHash: TX_HASH } },
    })
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' })
    mocks.createPublicClient.mockReturnValue({
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    })
  })

  it('sends an ERC-20 transfer and waits for a successful receipt', async () => {
    const result = await payEvmOrigin(input())

    expect(mocks.sendEvmPayment).toHaveBeenCalledWith({
      privateKey: TEST_KEY,
      depositAddress: DEPOSIT,
      amount: '222270',
      tokenAddress: USDC.asset,
      chain: expect.objectContaining({ id: 8453 }),
      rpcUrl: 'https://mainnet.base.org',
      quoteId: 'quote-1',
      nonce: 'nonce-1',
      expiresAt: '2026-11-02T12:30:00.000Z',
      accepted: REQUIREMENTS,
      originNetwork: 'eip155:8453',
      originAsset: USDC.asset,
      originAmount: '222270',
    })
    expect(mocks.createPublicClient).toHaveBeenCalledWith({
      chain: expect.objectContaining({ id: 8453 }),
      transport: expect.anything(),
    })
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH })
    expect(result).toEqual({
      txHash: TX_HASH,
      paymentPayload: { x402Version: 2, payload: { txHash: TX_HASH } },
    })
  })

  it('sends a native transfer when the asset is not a token contract', async () => {
    const native = { ...USDC, symbol: 'ETH', asset: 'native' }
    await payEvmOrigin(input({ asset: native }))

    const call = mocks.sendEvmPayment.mock.calls[0]?.[0]
    expect(call).toBeDefined()
    expect('tokenAddress' in (call as Record<string, unknown>)).toBe(false)
    expect(call).toMatchObject({ amount: '222270', depositAddress: DEPOSIT })
  })

  it('honours an explicit RPC URL and an unknown EVM chain', async () => {
    await payEvmOrigin(
      input({ originNetwork: 'eip155:7777', rpcUrl: 'https://rpc.example.invalid' }),
    )

    expect(mocks.sendEvmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: expect.objectContaining({ id: 7777, name: 'eip155:7777' }),
        rpcUrl: 'https://rpc.example.invalid',
      }),
    )
    expect(mocks.createPublicClient).toHaveBeenCalledWith({
      chain: expect.objectContaining({ id: 7777 }),
      transport: expect.anything(),
    })
  })

  it('throws when the origin transaction reverts', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' })

    await expect(payEvmOrigin(input())).rejects.toThrow(new RegExp(`${TX_HASH} reverted`))
  })
})
