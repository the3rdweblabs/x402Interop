// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import { ALL_NETWORKS } from '@x402interop/core'

import { createInteropClient, registerInteropHandlers, wrapFetchWithInterop } from '../src/index.js'
import { DEFAULT_SCHEMES, INTEROP_SCHEMES } from '../src/fetch.js'

// ---------------------------------------------------------------------------
// Offline fetch/response fakes. Nothing here touches the network; the only
// "wire" is a base64 JSON string, exactly like the real PAYMENT-REQUIRED
// header the http layer decodes.
// ---------------------------------------------------------------------------

/** Headers-like backed by a Map, with the case-insensitive get() of fetch. */
class FakeHeaders {
  private readonly entries = new Map<string, string>()

  constructor(init: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(init)) {
      this.entries.set(name.toLowerCase(), value)
    }
  }

  get(name: string): string | null {
    return this.entries.get(name.toLowerCase()) ?? null
  }
}

interface FakeResponse {
  status: number
  headers: FakeHeaders
  text: () => Promise<string>
  json: () => Promise<unknown>
}

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): FakeResponse {
  return {
    status,
    headers: new FakeHeaders(headers),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  }
}

function toBase64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64')
}

function decodeBase64(header: string): Record<string, never> {
  return JSON.parse(Buffer.from(header, 'base64').toString('utf-8'))
}

// ---------------------------------------------------------------------------
// Realistic 402 fixtures. `payTo` is the 1Click deposit address, and
// `extra.recipient` is the seller's own address (locked wire format).
// ---------------------------------------------------------------------------

const USDC_BASE = '0x833589fCD6eDb6E08f4c1C36D3677508a5338e2B'
const DEPOSIT_ADDRESS = '0x73b1ffed9c2d4e0f9267a4e51da34e0fca6f9f3c'
const SELLER_ADDRESS = '0x411dB0a54aC14A55Cf4f0B5fBAbf4e39F44f4C0c'
const RESOURCE_URL = 'https://agent.example.com/v1/research'

const INTENT_QUOTE = {
  quoteId: 'q-1click-abc123',
  depositAddress: DEPOSIT_ADDRESS,
  nonce: 'n-77d4',
  expiresAt: '2026-11-01T00:00:00.000Z',
  recipient: SELLER_ADDRESS,
}

function realisticPaymentRequired() {
  return {
    x402Version: 2,
    resource: {
      url: RESOURCE_URL,
      description: 'Real-time market research API',
      mimeType: 'application/json',
      serviceName: 'research-agent',
    },
    extensions: {
      x402interop: {
        info: { ...INTENT_QUOTE, depositAddress: DEPOSIT_ADDRESS, recipient: SELLER_ADDRESS },
        schema: { type: 'object' },
      },
    },
    accepts: [
      {
        scheme: 'x402interop-evm',
        network: 'eip155:8453',
        asset: USDC_BASE,
        amount: '1000000', // 1 USDC, 6 decimals
        payTo: DEPOSIT_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: { ...INTENT_QUOTE },
      },
      {
        scheme: 'x402interop-near',
        network: 'near:mainnet',
        asset: 'nep141:usdc.near',
        amount: '1000000',
        payTo: 'deposit.near',
        maxTimeoutSeconds: 300,
        extra: {
          quoteId: 'q-near-1',
          depositAddress: 'deposit.near',
          nonce: 'n-near-1',
          expiresAt: '2026-11-01T00:00:00.000Z',
          recipient: 'seller.near',
        },
      },
    ],
  }
}

describe('wrapFetchWithInterop', () => {
  it('passes non-402 responses straight through untouched', async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200, 'ok') as unknown as Response)
    const wrapped = wrapFetchWithInterop(fetchImpl as never, { spendControls: false })

    const response = await wrapped(RESOURCE_URL)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('pays a 402 from the PAYMENT-REQUIRED header and retries with PAYMENT-SIGNATURE', async () => {
    const paymentRequired = realisticPaymentRequired()
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
      void input
      void init
      if (fetchImpl.mock.calls.length === 1) {
        return makeResponse(
          402,
          { error: 'Payment Required' },
          { 'payment-required': toBase64(paymentRequired) },
        ) as unknown as Response
      }
      return makeResponse(200, { rows: [{ price: 42 }] }) as unknown as Response
    })
    const wrapped = wrapFetchWithInterop(fetchImpl as never, { spendControls: false })

    const response = await wrapped(RESOURCE_URL, { headers: { accept: 'application/json' } })

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    // The retry carried the encoded x402 v2 payload, built by the registered
    // interop scheme client (real upstream x402Client path).
    const headerMap = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string> | undefined
    expect(headerMap).toBeDefined()
    const signature = headerMap?.['PAYMENT-SIGNATURE'] ?? headerMap?.['payment-signature']
    expect(signature).toBeTruthy()

    const payload = decodeBase64(signature as string) as unknown as {
      x402Version: number
      accepted: { scheme: string; network: string }
      payload: {
        binding: { quoteId: string; depositAddress: string; nonce: string; expiresAt: string }
        authorization: { to: string; amount: string; asset: string; network: string }
      }
      extensions: { x402interop: { quoteId: string; depositAddress: string; recipient: string } }
    }
    expect(payload.x402Version).toBe(2)
    // Default selector takes the first (evm) accept of the realistic offer.
    expect(payload.accepted.scheme).toBe('x402interop-evm')
    expect(payload.accepted.network).toBe('eip155:8453')
    expect(payload.payload.binding.quoteId).toBe('q-1click-abc123')
    expect(payload.payload.binding.depositAddress).toBe(DEPOSIT_ADDRESS)
    expect(payload.payload.binding.nonce).toBe('n-77d4')
    expect(payload.payload.authorization.to).toBe(DEPOSIT_ADDRESS)
    expect(payload.payload.authorization.amount).toBe('1000000')
    expect(payload.extensions.x402interop.quoteId).toBe('q-1click-abc123')
    expect(payload.extensions.x402interop.recipient).toBe(SELLER_ADDRESS)
  })

  it('routes Request-like inputs by their url', async () => {
    const paymentRequired = realisticPaymentRequired()
    const fetchImpl = vi.fn(
      async (input: { url?: string }, init?: RequestInit): Promise<Response> => {
        void input
        if (fetchImpl.mock.calls.length === 1) {
          return makeResponse(
            402,
            { error: 'Payment Required' },
            { 'payment-required': toBase64(paymentRequired) },
          ) as unknown as Response
        }
        void init
        return makeResponse(200, 'paid') as unknown as Response
      },
    )
    const wrapped = wrapFetchWithInterop(fetchImpl as never, { spendControls: false })

    await wrapped({ url: RESOURCE_URL } as never)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const headerMap = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string> | undefined
    expect(headerMap?.['PAYMENT-SIGNATURE'] ?? headerMap?.['payment-signature']).toBeTruthy()
  })

  it('falls back to parsing the JSON body when no payment-required header is present', async () => {
    // v1 bodies are the only no-header fallback upstream honours; they flow
    // through the http layer as parsed JSON.
    const legacyBody = {
      x402Version: 1,
      accepts: [
        {
          scheme: 'upto',
          network: 'base-mainnet',
          maxAmountRequired: '250000',
          resource: RESOURCE_URL,
          description: 'Legacy v1 offer',
          mimeType: 'application/json',
          outputSchema: {},
          payTo: '0xlegacy-seller',
          maxTimeoutSeconds: 300,
          asset: 'usdc',
          extra: {},
        },
      ],
    }
    const createPaymentPayload = vi.fn(async (paymentRequired: unknown) => ({
      x402Version: 1,
      scheme: 'upto',
      network: 'base-mainnet',
      payload: { legacy: true, echo: paymentRequired },
    }))
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
      void input
      if (fetchImpl.mock.calls.length === 1) {
        return makeResponse(402, legacyBody) as unknown as Response
      }
      void init
      return makeResponse(200, 'paid') as unknown as Response
    })
    const wrapped = wrapFetchWithInterop(fetchImpl as never, {
      client: { createPaymentPayload } as never,
    })

    const response = await wrapped(new URL(RESOURCE_URL), {
      headers: [['x-trace', '1']],
    })

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    // The JSON body was parsed and handed to the client as paymentRequired.
    expect(createPaymentPayload).toHaveBeenCalledTimes(1)
    const parsed = createPaymentPayload.mock.calls[0]?.[0] as {
      accepts: Array<{ maxAmountRequired: string }>
    }
    expect(parsed.accepts[0]?.maxAmountRequired).toBe('250000')

    // v1 payloads are echoed under the X-PAYMENT header.
    const headerMap = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string> | undefined
    const xPayment = headerMap?.['X-PAYMENT'] ?? headerMap?.['x-payment']
    expect(xPayment).toBeTruthy()
    const decoded = decodeBase64(xPayment as string) as unknown as { x402Version: number }
    expect(decoded.x402Version).toBe(1)
  })
})

it('uses an existing client with payment-required hooks instead of re-minting', async () => {
  const paymentRequired = realisticPaymentRequired()
  const { http } = createInteropClient({ spendControls: false })
  http.onPaymentRequired(async () => ({ headers: { 'x-retry-hook': 'yes' } }))

  const fetchImpl = vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
    void input
    void init
    if (fetchImpl.mock.calls.length === 1) {
      return makeResponse(
        402,
        { error: 'Payment Required' },
        { 'payment-required': toBase64(paymentRequired) },
      ) as unknown as Response
    }
    return makeResponse(200, { ok: true }) as unknown as Response
  })
  const wrapped = wrapFetchWithInterop(fetchImpl as never, { http })
  const response = await wrapped(RESOURCE_URL)
  expect(response.status).toBe(200)
  const headers = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string> | undefined
  expect(headers?.['x-retry-hook']).toBe('yes')
})

it('tolerates a 402 whose body is not JSON when a header carries the answer', async () => {
  const paymentRequired = realisticPaymentRequired()
  const fetchImpl = vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
    void input
    void init
    if (fetchImpl.mock.calls.length === 1) {
      return makeResponse(402, '<html>oops</html>', {
        'payment-required': toBase64(paymentRequired),
      }) as unknown as Response
    }
    return makeResponse(200, { ok: true }) as unknown as Response
  })
  const wrapped = wrapFetchWithInterop(fetchImpl as never, { spendControls: false })
  const response = await wrapped(RESOURCE_URL)
  expect(response.status).toBe(200)
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})

describe('createInteropClient / registerInteropHandlers', () => {
  it('ships an upstream x402 client and http helper pair', () => {
    const { client, http } = createInteropClient()
    expect(client).toBeDefined()
    expect(typeof (client as unknown as { register: unknown }).register).toBe('function')
    expect(typeof http.createPaymentPayload).toBe('function')
    expect(typeof http.encodePaymentSignatureHeader).toBe('function')

    // Options are handed to the upstream config verbatim.
    const configured = createInteropClient({
      spendControls: false,
      paymentRequirementsSelector: () => undefined as never,
    })
    expect(typeof configured.http.getPaymentRequiredResponse).toBe('function')
  })

  it('registers one scheme client per (family × network) pair in the catalogue', () => {
    const captured: Array<{ network: string; client: { scheme?: string } }> = []
    registerInteropHandlers({
      register(network, client) {
        captured.push({ network, client: client as { scheme?: string } })
      },
    })

    // One registration per family network across every curated mainnet.
    expect(captured.length).toBe(ALL_NETWORKS.length)
    expect(captured.length).toBeGreaterThanOrEqual(INTEROP_SCHEMES.length)

    const near = captured.find((entry) => entry.network === 'near:mainnet')
    expect(near?.client.scheme).toBe('x402interop-near')
    const evm = captured.find((entry) => entry.network === 'eip155:8453')
    expect(evm?.client.scheme).toBe('x402interop-evm')

    const networks = new Set(captured.map((entry) => entry.network))
    expect(networks.has('eip155:1')).toBe(true)
    for (const entry of captured) {
      expect(INTEROP_SCHEMES).toContain(entry.client.scheme)
    }
  })

  it('honours explicit networks and scheme exclusions', () => {
    const captured: Array<{ network: string; client: { scheme?: string } }> = []
    registerInteropHandlers(
      {
        register(network, client) {
          captured.push({ network, client: client as { scheme?: string } })
        },
      },
      { networks: ['eip155:8453', 'near:mainnet'], excludeSchemes: ['x402interop-near'] },
    )

    expect(captured).toHaveLength(1)
    expect(captured[0]?.network).toBe('eip155:8453')
    expect(captured[0]?.client.scheme).toBe('x402interop-evm')
  })

  it('exposes the scheme constants shared with the rest of the client', () => {
    expect(INTEROP_SCHEMES).toHaveLength(12)
    expect(INTEROP_SCHEMES).toContain('x402interop-evm')
    expect(INTEROP_SCHEMES).toContain('x402interop-near')
    expect(DEFAULT_SCHEMES).toHaveLength(13)
    expect(DEFAULT_SCHEMES[0]).toBe('exact')
  })
})
