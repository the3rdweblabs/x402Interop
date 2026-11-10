// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import type { OneClickClient, OneClickQuoteRequest } from '../src/index.js'
import { ResilientOneClickClient } from '../src/resilient.js'
import { SdkOneClickClient } from '../src/sdk-client.js'

const request: OneClickQuoteRequest = {
  originAsset: 'nep141:base-usdc.omft.near',
  destinationAsset: 'nep141:sui-usdc.omft.near',
  amount: '50000',
  recipient: 'seller',
  refundTo: 'buyer',
  deadline: '2026-10-27T12:05:00Z',
  swapType: 'EXACT_OUTPUT',
  depositType: 'ORIGIN_CHAIN',
}

const defaultQuoteResponse = {
  correlationId: 'corr-1',
  signature: 'sig-ascii-for-quote-id-123456',
  quote: {
    depositAddress: '0xDeposit42',
    amountIn: '50250',
    amountInFormatted: '0.05025',
    minAmountIn: '50100',
    amountOut: '50000',
    amountOutFormatted: '0.05',
    withdrawFee: '20000',
    refundFee: '2400',
    timeEstimate: 60,
    // Three-day inactivity deadline; not the x402 payment window.
    deadline: '2026-10-30T12:00:00Z',
  },
  quoteRequest: {
    deadline: '2026-10-27T12:05:00Z',
  },
}

function fakeSdkModule(overrides: { quote?: unknown } = {}) {
  return {
    OpenAPI: { TOKEN: undefined as string | undefined, BASE: 'https://one.click/api/v0' },
    OneClickService: {
      getQuote: vi.fn(async () => overrides.quote ?? defaultQuoteResponse),
      getExecutionStatus: vi.fn(async () => ({
        status: 'SUCCESS',
        swapDetails: {
          originChainTxHashes: [{ hash: '0xorigin' }],
          destinationChainTxHashes: [{ hash: '0xdest' }],
        },
      })),
    },
  }
}

describe('SdkOneClickClient', () => {
  it('requests a quote and maps the SDK response', async () => {
    const client = new SdkOneClickClient({ module: fakeSdkModule(), token: 'secret' })
    const quote = await client.quote(request)
    expect(quote.depositAddress).toBe('0xDeposit42')
    expect(quote.originAmount).toBe('50250')
    expect(quote.destinationAmount).toBe('50000')
    expect(quote).toMatchObject({
      minAmountIn: '50100',
      withdrawFee: '20000',
      refundFee: '2400',
      amountInFormatted: '0.05025',
      amountOutFormatted: '0.05',
    })
    expect(quote.timeEstimateSeconds).toBe(60)
    expect(quote.expiresAt).toBe('2026-10-27T12:05:00Z')
    expect(quote.quoteId.startsWith('1click-')).toBe(true)
  })

  it('uses REST-compatible SDK defaults when optional quote fields are absent', async () => {
    const client = new SdkOneClickClient({
      module: fakeSdkModule({
        quote: {
          signature: '',
          quote: {
            depositAddress: '0xDeposit42',
            amountIn: '50250',
            minAmountIn: '50100',
            amountOut: '50000',
            timeEstimate: Number.NaN,
          },
        },
      }),
    })
    const quote = await client.quote({
      ...request,
      swapType: 'EXACT_INPUT',
      depositType: undefined,
      recipientType: undefined,
    })
    expect(quote.quoteId).toBe('1click-0xDeposit42')
    expect(quote.originAmount).toBe(request.amount)
    expect(quote.timeEstimateSeconds).toBe(45)
    expect(quote.expiresAt).toBe(request.deadline)
  })

  it('passes the bearer token into the SDK OpenAPI config', async () => {
    const module = fakeSdkModule()
    const client = new SdkOneClickClient({ module, token: 'secret' })
    await client.quote(request)
    expect(module.OpenAPI.TOKEN).toBe('secret')
  })

  it('overrides the SDK base URL so custom deployments stay on one host', async () => {
    const module = fakeSdkModule()
    const client = new SdkOneClickClient({ module, baseUrl: 'https://one.click/custom' })
    await client.quote(request)
    expect(module.OpenAPI.BASE).toBe('https://one.click/custom')
  })

  it('passes the deposit memo to the SDK status call', async () => {
    const module = fakeSdkModule()
    const client = new SdkOneClickClient({ module })
    await client.status('0xDeposit42', '12345')
    expect(module.OneClickService.getExecutionStatus).toHaveBeenCalledWith('0xDeposit42', '12345')
  })

  it('maps execution status to the wire status', async () => {
    const client = new SdkOneClickClient({ module: fakeSdkModule() })
    const status = await client.status('0xDeposit42')
    expect(status.status).toBe('SUCCESS')
    expect(status.originTxHash).toBe('0xorigin')
    expect(status.destinationTxHash).toBe('0xdest')
  })

  it('rejects a dry-run style quote without a deposit address', async () => {
    const client = new SdkOneClickClient({
      module: fakeSdkModule({
        quote: {
          quote: { amountIn: '1', amountOut: '1', timeEstimate: 10 },
        },
      }),
    })
    await expect(client.quote(request)).rejects.toThrow(/depositAddress/)
  })

  it('maps a status without swap details to undefined tx hashes', async () => {
    const client = new SdkOneClickClient({
      module: {
        OpenAPI: { TOKEN: undefined, BASE: 'x' },
        OneClickService: {
          getQuote: vi.fn(),
          getExecutionStatus: vi.fn(async () => ({ status: 'PENDING_DEPOSIT', swapDetails: {} })),
        },
      },
    })
    const status = await client.status('0x1')
    expect(status.status).toBe('PENDING_DEPOSIT')
    expect(status.originTxHash).toBeUndefined()
    expect(status.destinationTxHash).toBeUndefined()
  })

  it('allows swapping the REST client after construction', async () => {
    const restClient = { quote: vi.fn(), status: vi.fn(), submitDeposit: vi.fn() }
    const client = new SdkOneClickClient({ module: fakeSdkModule() })
    client.setRestClient(restClient)
    await client.submitDeposit({ depositAddress: '0x1', txHash: '0x2' })
    expect(restClient.submitDeposit).toHaveBeenCalled()
  })

  it('delegates submitDeposit to the REST client and fails closed otherwise', async () => {
    const restClient = {
      quote: vi.fn(),
      status: vi.fn(),
      submitDeposit: vi.fn(async () => ({ accepted: true })),
    }
    const withRest = new SdkOneClickClient({ module: fakeSdkModule(), restClient })
    expect((await withRest.submitDeposit({ depositAddress: '0x1', txHash: '0x2' })).accepted).toBe(
      true,
    )
    const withoutRest = new SdkOneClickClient({ module: fakeSdkModule() })
    await expect(
      withoutRest.submitDeposit({ depositAddress: '0x1', txHash: '0x2' }),
    ).rejects.toMatchObject({ operation: 'submitDeposit' })
  })
})

describe('ResilientOneClickClient', () => {
  function failing(name: string): OneClickClient {
    return {
      quote: vi.fn(async () => {
        throw new Error(`${name} quote failed`)
      }),
      status: vi.fn(async () => {
        throw new Error(`${name} status failed`)
      }),
      submitDeposit: vi.fn(async () => {
        throw new Error(`${name} submit failed`)
      }),
    }
  }

  function working(name: string): OneClickClient {
    return {
      quote: vi.fn(async (q: OneClickQuoteRequest) => ({
        quoteId: `${name}-q`,
        depositAddress: `${name}-deposit`,
        originAmount: q.amount,
        destinationAmount: q.amount,
        timeEstimateSeconds: 30,
        expiresAt: '2026-10-30T12:00:00Z',
      })),
      status: vi.fn(async (depositAddress: string) => ({
        status: 'SUCCESS' as const,
        depositAddress,
      })),
      submitDeposit: vi.fn(async () => ({ accepted: true })),
    }
  }

  it('falls over from the SDK transport to REST', async () => {
    const sdk = failing('sdk')
    const rest = working('rest')
    const client = new ResilientOneClickClient([sdk, rest])
    const quote = await client.quote(request)
    expect(quote.quoteId).toBe('rest-q')
    expect(sdk.quote).toHaveBeenCalledOnce()
    expect(rest.quote).toHaveBeenCalledOnce()
  })

  it('remembers the transport that answered', async () => {
    const sdk = failing('sdk')
    const rest = working('rest')
    const client = new ResilientOneClickClient([sdk, rest])
    await client.quote(request)
    await client.status('deposit')
    expect(rest.status).toHaveBeenCalledTimes(1)
    expect(sdk.status).not.toHaveBeenCalled() // preference skips the sdk
  })

  it('forwards the deposit memo to the transport', async () => {
    const rest = working('rest')
    const client = new ResilientOneClickClient([rest])
    await client.status('deposit', '12345')
    expect(rest.status).toHaveBeenCalledWith('deposit', '12345')
  })

  it('throws when every transport fails', async () => {
    const client = new ResilientOneClickClient([failing('a'), failing('b')])
    await expect(client.quote(request)).rejects.toThrow(/failed/)
  })

  it('wraps non-Error failures', async () => {
    const throwsString: OneClickClient = {
      quote: vi.fn(async () => {
        throw 'boom'
      }),
      status: vi.fn(),
      submitDeposit: vi.fn(),
    }
    const client = new ResilientOneClickClient([throwsString])
    await expect(client.quote(request)).rejects.toThrow(/all 1 OneClick transports failed/)
  })

  it('rejects an empty transport list', () => {
    expect(() => new ResilientOneClickClient([])).toThrow(/1 transport/)
  })
})
