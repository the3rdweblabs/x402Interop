// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import { ALL_NETWORKS, type Network, type PaymentRequirements } from '@x402interop/core'

import { resolveCapabilities } from '../src/capabilities.js'
import {
  createInteropClient,
  createInteropFacilitator,
  createInteropServer,
  type QuoteMint,
  type QuoteMinter,
} from '../src/interop/index.js'
import {
  DEFAULT_SCHEMES,
  INTEROP_SCHEMES,
  SCHEME_MANIFEST,
  entryForFamily,
  entryForInteropScheme,
  exactSourceFor,
} from '../src/upstream/manifest.js'
import { supportsExact } from '../src/upstream/registry.js'

const USDC_BASE = '0x833589fCD6eDb6E08f4c1C36D3677508a5338e2B'
const DEPOSIT_ADDRESS = '0x73b1ffed9c2d4e0f9267a4e51da34e0fca6f9f3c'
const SELLER_ADDRESS = '0x411dB0a54aC14A55Cf4f0B5fBAbf4e39F44f4C0c'

function interopRequirement(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: 'x402interop-evm',
    network: 'eip155:8453',
    asset: USDC_BASE,
    amount: '1000000',
    payTo: DEPOSIT_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: {
      quoteId: 'q1',
      depositAddress: DEPOSIT_ADDRESS,
      nonce: 'n1',
      expiresAt: '2026-11-01T00:00:00.000Z',
      recipient: SELLER_ADDRESS,
    },
    ...overrides,
  }
}

describe('resolveCapabilities', () => {
  it('defaults to exact plus every interop scheme on every curated network', () => {
    const caps = resolveCapabilities()

    expect(caps.schemes).toEqual(['exact', ...INTEROP_SCHEMES])
    for (const scheme of INTEROP_SCHEMES) expect(caps.schemes).toContain(scheme)
    expect(caps.schemes).toContain('exact')
    expect(caps.networks).toEqual([...ALL_NETWORKS])
  })

  it('ignores scheme exclusions that are not in the default set', () => {
    const caps = resolveCapabilities({ excludeSchemes: ['upto'] })

    expect(caps.schemes).toEqual([...DEFAULT_SCHEMES])
    expect(caps.dropped?.scheme).toEqual([])
  })

  it('drops excluded networks', () => {
    const caps = resolveCapabilities({ excludeNetworks: ['eip155:1'] })

    expect(caps.networks).not.toContain('eip155:1')
    expect(caps.networks).toHaveLength(ALL_NETWORKS.length - 1)
    expect(caps.dropped?.network).toEqual(['eip155:1'])
  })

  it('never widens explicit scheme/network arrays', () => {
    const caps = resolveCapabilities({
      schemes: ['x402interop-evm'],
      networks: ['eip155:8453'],
    })

    expect(caps.schemes).toEqual(['x402interop-evm'])
    expect(caps.networks).toEqual(['eip155:8453'])
  })

  it('familyNetworks replaces one family while the others keep the catalogue', () => {
    const caps = resolveCapabilities({ familyNetworks: { evm: ['eip155:1'] } })

    expect(caps.networks).toContain('eip155:1')
    expect(caps.networks).not.toContain('eip155:8453')
    expect(caps.networks).toContain('near:mainnet')
    expect(caps.networks).toContain('sui:mainnet')
    expect(caps.networks).toHaveLength(ALL_NETWORKS.length - 12 + 1)
  })

  it('treats explicit "all" markers as the defaults and never lets familyNetworks widen explicit networks', () => {
    expect(resolveCapabilities({ schemes: 'all', networks: 'all' }).networks).toEqual([
      ...ALL_NETWORKS,
    ])

    const caps = resolveCapabilities({
      networks: ['eip155:8453'],
      familyNetworks: { evm: ['eip155:1'] },
    })
    expect(caps.networks).toEqual(['eip155:8453'])
  })
})

describe('upstream manifest', () => {
  it('describes all twelve families', () => {
    expect(SCHEME_MANIFEST).toHaveLength(12)
    expect(INTEROP_SCHEMES).toHaveLength(12)
    expect(entryForInteropScheme('x402interop-tvm')?.family).toBe('ton')
  })

  it('marks tron interop-only and sui spec-native', () => {
    expect(entryForFamily('tron')?.exactSource).toBe('interop-only')
    expect(entryForFamily('sui')?.exactSource).toBe('spec-native')
    expect(exactSourceFor('exact', 'sui')).toBe('spec-native')
    expect(exactSourceFor('exact', 'evm')).toBe('upstream')
    expect(exactSourceFor('upto', 'sui')).toBeUndefined()
  })

  it('supports exact only where a spec or upstream package exists', () => {
    expect(supportsExact('tron')).toBe(false)
    expect(supportsExact('utxo')).toBe(false)
    expect(supportsExact('evm')).toBe(true)
    expect(supportsExact('sui')).toBe(true)
  })
})

interface InteropPayloadResult {
  x402Version: number
  payload: {
    authorization: Record<string, unknown>
    binding: Record<string, unknown>
  }
  extensions?: Record<string, unknown>
}

describe('createInteropClient (adpt)', () => {
  it('builds a bound x402interop payload carrying the quote extension', async () => {
    const client = createInteropClient('evm', {})
    expect(client.scheme).toBe('x402interop-evm')

    const requirements = interopRequirement()
    const payload = (await client.createPaymentPayload(2, requirements)) as InteropPayloadResult

    expect(payload.x402Version).toBe(2)
    expect(payload.payload.binding.quoteId).toBe('q1')
    expect(payload.payload.binding.depositAddress).toBe(DEPOSIT_ADDRESS)
    expect(payload.payload.binding.nonce).toBe('n1')
    expect(payload.payload.authorization.to).toBe(
      (requirements.extra as Record<string, unknown>).depositAddress,
    )
    expect(payload.payload.authorization.amount).toBe('1000000')
    expect(payload.payload.authorization.asset).toBe(USDC_BASE)

    const extension = payload.extensions?.x402interop as Record<string, unknown>
    expect(extension).toBeDefined()
    expect(extension.quoteId).toBe('q1')
    expect(extension.depositAddress).toBe(DEPOSIT_ADDRESS)
    expect(extension.recipient).toBe(SELLER_ADDRESS)
  })

  it('honours an injected signer address', async () => {
    const client = createInteropClient('evm', {
      signer: {
        signerAddress: () => '0xbuyer',
        sign: async (authorization) => ({ ...authorization, signature: '0xdeadbeef' }),
      },
    })

    const payload = (await client.createPaymentPayload(
      2,
      interopRequirement(),
    )) as InteropPayloadResult
    expect(payload.x402Version).toBe(2)
    expect(payload.payload.authorization.from).toBe('0xbuyer')
    expect(payload.payload.authorization.signature).toBe('0xdeadbeef')
  })
})

const MINT_RESULT: QuoteMint = {
  depositAddress: DEPOSIT_ADDRESS,
  quoteId: 'q-mint-1',
  nonce: 'n-mint-1',
  expiresAt: '2026-11-01T00:00:00.000Z',
  originNetwork: 'eip155:8453' as Network,
  originAsset: USDC_BASE,
}

describe('createInteropServer (adpt)', () => {
  it('fills a vacant payTo with a fresh quote and is idempotent on filled entries', async () => {
    const mint = vi.fn(async (): Promise<QuoteMint> => ({ ...MINT_RESULT }))
    const fakeMinter: QuoteMinter = { mint }
    const server = createInteropServer('evm', fakeMinter)

    const vacant = interopRequirement({ payTo: '', extra: {} })
    const exact = {
      scheme: 'exact',
      network: 'eip155:8453',
      asset: USDC_BASE,
      amount: '1000000',
      payTo: '0xfixed',
      maxTimeoutSeconds: 300,
      extra: {},
    } as PaymentRequirements

    const paymentRequiredResponse: { extensions?: Record<string, unknown> } = { extensions: {} }
    const context = {
      requirements: [vacant, exact],
      paymentRequiredResponse,
      resourceInfo: { url: 'https://agent.example.com/v1/research' } as never,
    } as never

    const enrich = server.enrichPaymentRequiredResponse
    expect(enrich).toBeDefined()
    const enriched = (await enrich?.(context)) as PaymentRequirements[]
    expect(enriched).toHaveLength(2)

    // The vacant interop entry got a minted deposit address and quote extras.
    expect(enriched[0]?.payTo).toBe(DEPOSIT_ADDRESS)
    expect(enriched[0]?.extra.recipient).toBe('')
    expect(enriched[0]?.extra.quoteId).toBe('q-mint-1')
    expect(enriched[0]?.extra.depositAddress).toBe(DEPOSIT_ADDRESS)
    expect(enriched[0]?.extra.nonce).toBe('n-mint-1')

    // Other schemes pass straight through.
    expect(enriched[1]).toBe(exact)

    // The server extension was stamped onto the payment required response.
    const extensions = (paymentRequiredResponse.extensions ?? {}) as Record<string, unknown>
    expect(extensions.x402interop).toEqual({
      quoteId: 'q-mint-1',
      depositAddress: DEPOSIT_ADDRESS,
      recipient: '',
    })

    // A second enrich over the filled entry re-mints nothing.
    const second = (await enrich?.({
      requirements: enriched,
      paymentRequiredResponse: { extensions: {} } as never,
      resourceInfo: { url: 'https://agent.example.com/v1/research' } as never,
    } as never)) as PaymentRequirements[]
    expect(second[0]?.payTo).toBe(DEPOSIT_ADDRESS)
    expect(second[0]?.extra.quoteId).toBe('q-mint-1')
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it('applies maxTimeoutSeconds overrides to enriched entries', async () => {
    const mint = vi.fn(async (): Promise<QuoteMint> => ({ ...MINT_RESULT }))
    const server = createInteropServer('evm', { mint }, { maxTimeoutSeconds: 600 })
    const enrich = server.enrichPaymentRequiredResponse

    const enriched = (await enrich?.({
      requirements: [interopRequirement({ payTo: '' })],
      paymentRequiredResponse: { extensions: {} } as never,
      resourceInfo: { url: 'https://agent.example.com/v1/research' } as never,
    } as never)) as PaymentRequirements[]

    expect(enriched[0]?.maxTimeoutSeconds).toBe(600)
  })
})

describe('createInteropFacilitator (adpt)', () => {
  it('describes the evm family and exposes verify/settle', () => {
    const facilitator = createInteropFacilitator('evm')

    expect(facilitator.scheme).toBe('x402interop-evm')
    expect(facilitator.caipFamily).toBe('eip155:*')
    expect(typeof facilitator.verify).toBe('function')
    expect(typeof facilitator.settle).toBe('function')
  })
})
