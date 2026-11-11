// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type {
  OneClickClient,
  OneClickQuote,
  OneClickQuoteRequest,
  OneClickStatus,
  OneClickSwapStatus,
} from '@x402interop/intents'
import { describe, expect, it, vi } from 'vitest'

import {
  encodePaymentRequiredHeader,
  isTerminalSwapStatus,
  runCanary,
  schemeForNetwork,
  swapStateLabel,
  TERMINAL_SWAP_STATUSES,
  type CanaryResult,
} from '../src/canary.js'
import { readCanaryConfig, SEND_CONFIRMATION, type CanaryConfig } from '../src/config.js'
import type { PayerInput } from '../src/evm-payer.js'
import { privateKeyToAccount } from 'viem/accounts'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const BUYER = '0x2222222222222222222222222222222222222222'
const SELLER = `0x${'11'.repeat(32)}`
const DEPOSIT = `0x${'ab'.repeat(20)}`
const TEST_KEY = testPrivateKeyOrPlaceholder()
const HAS_TEST_KEY = hasTestPrivateKey()
const TEST_ADDRESS = privateKeyToAccount(TEST_KEY).address

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    CANARY_ORIGIN_NETWORK: 'base',
    CANARY_DEST_NETWORK: 'sui:mainnet',
    CANARY_AMOUNT: '200000',
    CANARY_ORIGIN_ADDRESS: BUYER,
    CANARY_DEST_ADDRESS: SELLER,
    CANARY_POLL_INTERVAL_SECONDS: '1',
    CANARY_POLL_TIMEOUT_SECONDS: '2',
    ...overrides,
  }
}

function quoteOnlyConfig(overrides: Record<string, string | undefined> = {}): CanaryConfig {
  return readCanaryConfig(env(overrides))
}

function sendConfig(overrides: Record<string, string | undefined> = {}): CanaryConfig {
  return readCanaryConfig(
    env({
      CANARY_ORIGIN_ADDRESS: undefined,
      CANARY_ORIGIN_PRIVATE_KEY: TEST_KEY,
      CANARY_CONFIRM: SEND_CONFIRMATION,
      ...overrides,
    }),
    { send: true },
  )
}

function quote(overrides: Partial<OneClickQuote> = {}): OneClickQuote {
  return {
    quoteId: 'quote-1',
    depositAddress: DEPOSIT,
    originAmount: '222270',
    destinationAmount: '200000',
    timeEstimateSeconds: 50,
    expiresAt: '2026-11-02T12:30:00.000Z',
    ...overrides,
  }
}

interface FakeClient {
  client: OneClickClient
  quoteCalls: OneClickQuoteRequest[]
  statusCalls: string[]
  status: ReturnType<typeof vi.fn>
}

function fakeClient(
  options: { quote?: OneClickQuote; statuses?: OneClickSwapStatus[] } = {},
): FakeClient {
  const minted = options.quote ?? quote()
  const statuses = options.statuses ?? ['PENDING_DEPOSIT']
  const quoteCalls: OneClickQuoteRequest[] = []
  const statusCalls: string[] = []
  let index = 0

  const status = vi.fn(async (depositAddress: string): Promise<OneClickStatus> => {
    statusCalls.push(depositAddress)
    const current = statuses[Math.min(index, statuses.length - 1)] ?? 'PENDING_DEPOSIT'
    index += 1
    return {
      status: current,
      depositAddress,
      ...(current !== 'PENDING_DEPOSIT' ? { originTxHash: '0xorigin' } : {}),
      ...(current === 'SUCCESS' ? { destinationTxHash: '0xdestination' } : {}),
    }
  })

  return {
    client: {
      quote: async (request) => {
        quoteCalls.push(request)
        return minted
      },
      status,
      submitDeposit: async () => ({ accepted: true }),
    },
    quoteCalls,
    statusCalls,
    status,
  }
}

function clock(start = 0): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let value = start
  return {
    now: () => value,
    sleep: async (ms: number) => {
      value += ms
    },
  }
}

describe('canary environment', () => {
  it('accepts a NEAR destination for final-address delivery', () => {
    const config = quoteOnlyConfig({
      CANARY_DEST_NETWORK: 'near:mainnet',
      CANARY_DEST_ASSET: 'USDC',
      CANARY_DEST_ADDRESS: 'seller.near',
    })
    expect(config.destinationNetwork).toBe('near:mainnet')
  })
})

describe('schemeForNetwork', () => {
  it('maps every supported origin family to its interop scheme', () => {
    expect(schemeForNetwork('eip155:8453')).toBe('x402interop-evm')
    expect(schemeForNetwork('sui:mainnet')).toBe('x402interop-sui')
    expect(schemeForNetwork('near:mainnet')).toBe('x402interop-near')
    expect(schemeForNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('x402interop-svm')
    expect(schemeForNetwork('tvm:-239')).toBe('x402interop-tvm')
    expect(schemeForNetwork('tron:728126428')).toBe('x402interop-tron')
    expect(schemeForNetwork('xrpl:0')).toBe('x402interop-xrpl')
    expect(schemeForNetwork('aptos:1')).toBe('x402interop-aptos')
    expect(schemeForNetwork('stellar:pubnet')).toBe('x402interop-stellar')
    expect(schemeForNetwork('starknet:SN_MAIN')).toBe('x402interop-starknet')
    expect(schemeForNetwork('lnbtc:000000000019d6689c085ae165831e93')).toBe('x402interop-lightning')
    expect(schemeForNetwork('bip122:000000000019d6689c085ae165831e93')).toBe('x402interop-utxo')
  })

  it('falls back to the EVM scheme for an unknown namespace', () => {
    expect(schemeForNetwork('unknown:1' as never)).toBe('x402interop-evm')
  })
})

describe('swap status helpers', () => {
  it('marks only settlement outcomes as terminal', () => {
    expect(TERMINAL_SWAP_STATUSES).toHaveLength(4)
    for (const status of TERMINAL_SWAP_STATUSES) {
      expect(isTerminalSwapStatus(status)).toBe(true)
    }
    expect(isTerminalSwapStatus('PENDING_DEPOSIT')).toBe(false)
    expect(isTerminalSwapStatus('KNOWN_DEPOSIT_TX')).toBe(false)
    expect(isTerminalSwapStatus('PROCESSING')).toBe(false)
  })

  it('labels every status for a human', () => {
    expect(swapStateLabel('PENDING_DEPOSIT')).toMatch(/origin deposit/)
    expect(swapStateLabel('KNOWN_DEPOSIT_TX')).toMatch(/confirmation/)
    expect(swapStateLabel('PROCESSING')).toMatch(/in flight/)
    expect(swapStateLabel('SUCCESS')).toBe('settled')
    expect(swapStateLabel('INCOMPLETE_DEPOSIT')).toMatch(/incomplete/)
    expect(swapStateLabel('REFUNDED')).toMatch(/refunded/)
    expect(swapStateLabel('FAILED')).toBe('failed')
    expect(swapStateLabel('SOMETHING_ELSE' as OneClickSwapStatus)).toBe('SOMETHING_ELSE')
  })
})

describe('encodePaymentRequiredHeader', () => {
  it('base64-encodes the canonical JSON body', () => {
    const body = {
      x402Version: 2 as const,
      error: 'PAYMENT-SIGNATURE header is required',
      resource: { url: 'https://example.invalid/resource' },
      accepts: [],
    }
    const decoded = JSON.parse(Buffer.from(encodePaymentRequiredHeader(body), 'base64').toString())
    expect(decoded).toEqual(body)
  })
})

describe('runCanary quote-only mode', () => {
  it('mints a cross-chain quote and shapes the canonical 402 body', async () => {
    const { client, quoteCalls, statusCalls } = fakeClient()
    const result = await runCanary(quoteOnlyConfig(), { client })

    expect(quoteCalls).toHaveLength(1)
    expect(quoteCalls[0]).toMatchObject({
      originAsset: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
      destinationAsset: 'nep141:sui-c1b81ecaf27933252d31a963bc5e9458f13c18ce.omft.near',
      amount: '200000',
      recipient: SELLER,
      refundTo: BUYER,
      swapType: 'EXACT_OUTPUT',
      depositType: 'ORIGIN_CHAIN',
      recipientType: 'DESTINATION_CHAIN',
      dry: false,
    })
    expect(quoteCalls[0]?.deadline).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    expect(result.finalStatus).toBe('PENDING_DEPOSIT')
    expect(result.timedOut).toBe(false)
    expect(result.originTxHash).toBeUndefined()
    expect(statusCalls).toHaveLength(0)

    const required = result.paymentRequired
    expect(required).toBeDefined()
    expect(required?.x402Version).toBe(2)
    expect(required?.resource).toEqual({
      url: 'https://example.invalid/x402interop/canary',
      description: 'x402Interop live canary resource',
      mimeType: 'application/json',
    })
    expect(required?.accepts).toHaveLength(1)
    expect(required?.accepts[0]).toMatchObject({
      scheme: 'x402interop-evm',
      network: 'sui:mainnet',
      asset: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      amount: '200000',
      payTo: DEPOSIT,
      maxTimeoutSeconds: 300,
      extra: {
        quoteId: 'quote-1',
        depositAddress: DEPOSIT,
        originNetwork: 'eip155:8453',
        originAmount: '222270',
        deliveryMode: 'on_deposit',
        refundTo: BUYER,
        buyerAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        recipient: SELLER,
      },
    })
    expect(required?.extensions?.x402interop).toMatchObject({
      info: { quoteId: 'quote-1', depositAddress: DEPOSIT },
      schema: { type: 'object' },
    })

    expect(result.prepared.path).toBe('deposit_address')
  })

  it('asks 1Click for a dry quote and omits the 402 body', async () => {
    const { client, quoteCalls } = fakeClient()
    const result = await runCanary(quoteOnlyConfig({ CANARY_QUOTE_DRY: 'true' }), { client })

    expect(quoteCalls[0]?.dry).toBe(true)
    expect(result.paymentRequired).toBeUndefined()
    expect(result.finalStatus).toBe('PENDING_DEPOSIT')
  })

  it('logs the quote, memo, and status transitions without repeating labels', async () => {
    const logs: string[] = []
    const { client } = fakeClient({
      quote: quote({ depositMemo: 'memo-42' }),
      statuses: ['PENDING_DEPOSIT', 'PENDING_DEPOSIT', 'PROCESSING', 'SUCCESS'],
    })
    const { now, sleep } = clock()

    const result = await runCanary(
      quoteOnlyConfig({ CANARY_WAIT: 'true', CANARY_POLL_TIMEOUT_SECONDS: '10' }),
      {
        client,
        now,
        sleep,
        log: (line) => logs.push(line),
      },
    )

    expect(result.finalStatus).toBe('SUCCESS')
    expect(result.timedOut).toBe(false)
    expect(result.receipt?.destinationTxHash).toBe('0xdestination')
    expect(logs[0]).toContain('quote quote-1')
    expect(logs).toContain('deposit memo/tag: memo-42')
    expect(logs.filter((line) => line.startsWith('status PENDING_DEPOSIT'))).toHaveLength(1)
    expect(logs.some((line) => line.includes('status SUCCESS: settled'))).toBe(true)
  })

  it('returns early when asked to wait on a quote with no deposit address', async () => {
    const { client, statusCalls } = fakeClient({ quote: quote({ depositAddress: '' }) })
    const result = await runCanary(quoteOnlyConfig({ CANARY_WAIT: 'true' }), { client })

    expect(result.finalStatus).toBe('PENDING_DEPOSIT')
    expect(result.timedOut).toBe(false)
    expect(statusCalls).toHaveLength(0)
  })

  it('uses real timers and a no-op logger when no dependencies are injected', async () => {
    const { client } = fakeClient({ statuses: ['PENDING_DEPOSIT', 'SUCCESS'] })
    const config = {
      ...quoteOnlyConfig({ CANARY_WAIT: 'true' }),
      pollIntervalMs: 1,
      pollTimeoutMs: 1_000,
    }

    const result = await runCanary(config, { client })

    expect(result.finalStatus).toBe('SUCCESS')
    expect(result.timedOut).toBe(false)
  })
})

describe.skipIf(!HAS_TEST_KEY)('runCanary sending mode', () => {
  it('pays the quote once and polls to settlement', async () => {
    const payer = vi.fn(async (_input: PayerInput) => ({
      txHash: `0x${'cd'.repeat(32)}` as `0x${string}`,
      paymentPayload: { x402Version: 2, payload: { txHash: '0xorigin' } },
    }))
    const { client, statusCalls } = fakeClient({
      statuses: ['KNOWN_DEPOSIT_TX', 'SUCCESS'],
    })
    const { now, sleep } = clock()

    const result: CanaryResult = await runCanary(sendConfig(), {
      client,
      payer,
      now,
      sleep,
    })

    expect(payer).toHaveBeenCalledTimes(1)
    const input = payer.mock.calls[0]?.[0]
    expect(input).toMatchObject({
      privateKey: TEST_KEY,
      originNetwork: 'eip155:8453',
      asset: expect.objectContaining({ symbol: 'USDC' }),
      amount: '222270',
      depositAddress: DEPOSIT,
      quoteId: 'quote-1',
      expiresAt: '2026-11-02T12:30:00.000Z',
    })
    expect(input?.nonce).toMatch(/^[0-9a-f-]{36}$/)

    expect(result.originTxHash).toBe(`0x${'cd'.repeat(32)}`)
    expect(result.paymentPayload).toEqual({ x402Version: 2, payload: { txHash: '0xorigin' } })
    expect(result.finalStatus).toBe('SUCCESS')
    expect(result.timedOut).toBe(false)
    expect(statusCalls).toEqual([DEPOSIT, DEPOSIT])
  })

  it('refuses to send without a payer', async () => {
    const { client } = fakeClient()
    await expect(runCanary(sendConfig(), { client })).rejects.toThrow(/No origin payer/)
  })

  it('refuses to send without a private key', async () => {
    const { client } = fakeClient()
    const config = { ...sendConfig(), privateKey: undefined }
    await expect(runCanary(config, { client, payer: vi.fn() })).rejects.toThrow(
      /CANARY_ORIGIN_PRIVATE_KEY is required/,
    )
  })

  it('refuses to send when the quote has no deposit address', async () => {
    const payer = vi.fn()
    const { client } = fakeClient({ quote: quote({ depositAddress: '' }) })
    await expect(runCanary(sendConfig(), { client, payer })).rejects.toThrow(/no deposit address/)
    expect(payer).not.toHaveBeenCalled()
  })

  it('stops polling at the timeout and keeps the last status', async () => {
    const payer = vi.fn(async () => ({
      txHash: `0x${'cd'.repeat(32)}` as `0x${string}`,
      paymentPayload: {},
    }))
    const { client, statusCalls } = fakeClient({ statuses: ['PENDING_DEPOSIT'] })
    const { now, sleep } = clock()

    const result = await runCanary(sendConfig(), { client, payer, now, sleep })

    expect(result.timedOut).toBe(true)
    expect(result.finalStatus).toBe('PENDING_DEPOSIT')
    expect(result.receipt?.status).toBe('PENDING_DEPOSIT')
    expect(statusCalls).toHaveLength(2)
  })

  it('treats a refund as terminal', async () => {
    const payer = vi.fn(async () => ({
      txHash: `0x${'cd'.repeat(32)}` as `0x${string}`,
      paymentPayload: {},
    }))
    const { client, statusCalls } = fakeClient({ statuses: ['REFUNDED'] })
    const { now, sleep } = clock()

    const result = await runCanary(sendConfig(), { client, payer, now, sleep })

    expect(result.finalStatus).toBe('REFUNDED')
    expect(result.timedOut).toBe(false)
    expect(statusCalls).toHaveLength(1)
  })
})

describe.skipIf(!HAS_TEST_KEY)('origin address', () => {
  it('uses the key-derived address as refundTo', async () => {
    const { client, quoteCalls } = fakeClient()
    await runCanary(sendConfig({ CANARY_WAIT: 'false' }), {
      client,
      payer: async () => ({ txHash: `0x${'cd'.repeat(32)}` as `0x${string}`, paymentPayload: {} }),
    })
    expect(quoteCalls[0]?.refundTo).toBe(TEST_ADDRESS)
  })
})
