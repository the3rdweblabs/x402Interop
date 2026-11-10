// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import {
  ALL_NETWORKS,
  ASSETS,
  assertKnownNetwork,
  assetsForFamily,
  assetsForNetwork,
  bindingMatchesQuote,
  defaultNetworkForFamily,
  familyForNetwork,
  familyForScheme,
  findAsset,
  findAssetByIntentId,
  hasPaymentAmount,
  hasPaymentPayTo,
  isInteropScheme,
  isKnownNetwork,
  NETWORK_ALIASES,
  NETWORK_CATALOGUE,
  networksForFamily,
  normalizeNetwork,
  parsePaymentRequirements,
  parseX402InteropExtension,
  preferredAssetForNetwork,
  readX402InteropExtension,
  SCHEME_IDS,
  summaryForScheme,
  X402_VERSION,
  x402InteropExtension,
  type PaymentRequirements,
  type RouteConfig,
  type SchemeNetworkFacilitator,
  type X402InteropBinding,
  type X402InteropQuoteInfo,
} from '../src/index.js'

const quote: X402InteropQuoteInfo = {
  quoteId: 'q-1',
  depositAddress: '0x1111111111111111111111111111111111111111',
  originNetwork: 'eip155:8453',
  originAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  originAmount: '51000',
  expiresAt: '2026-10-27T12:00:00Z',
  timeEstimateSeconds: 45,
  deliveryMode: 'on_deposit',
  refundTo: '0x2222222222222222222222222222222222222222',
}

const requirements: PaymentRequirements = {
  scheme: 'x402interop-evm',
  network: 'sui:mainnet',
  asset: 'usdc',
  amount: '50000',
  payTo: '0xDeposit',
  maxTimeoutSeconds: 300,
  extra: { ...quote },
}

describe('upstream types', () => {
  it('re-exports the x402 v2 protocol version', () => {
    expect(X402_VERSION).toBe(2)
  })

  it('exposes role interfaces without redefining them', () => {
    // Compiles only when core re-exports the upstream interface verbatim.
    const facilitator: SchemeNetworkFacilitator = {
      scheme: 'exact',
      caipFamily: 'eip155:*',
      getExtra: () => undefined,
      getSigners: () => [],
      verify: async () => ({ isValid: true }),
      settle: async (_payload, settleRequirements) => ({
        success: true,
        transaction: '0x',
        network: settleRequirements.network,
      }),
    }
    expect(facilitator.scheme).toBe('exact')
  })

  it('exposes route config types for framework adapters', () => {
    const route: RouteConfig = {
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:8453',
          price: '$0.01',
          payTo: '0xSeller',
        },
        {
          scheme: 'x402interop-evm',
          network: 'eip155:8453',
          price: '$0.01',
          payTo: '',
        },
      ],
    }
    expect(route.accepts).toHaveLength(2)
  })
})

describe('payment helpers', () => {
  it('accepts a positive atomic amount and rejects zero or junk', () => {
    expect(hasPaymentAmount(requirements)).toBe(true)
    expect(hasPaymentAmount({ ...requirements, amount: '0' })).toBe(false)
    expect(hasPaymentAmount({ ...requirements, amount: '0.05' })).toBe(false)
  })

  it('treats a vacant payTo as unfilled', () => {
    expect(hasPaymentPayTo(requirements)).toBe(true)
    expect(hasPaymentPayTo({ ...requirements, payTo: '' })).toBe(false)
    expect(hasPaymentPayTo({ ...requirements, payTo: '   ' })).toBe(false)
  })

  it('parses payment requirements and rejects a missing scheme', () => {
    expect(parsePaymentRequirements(requirements).payTo).toBe('0xDeposit')
    expect(parsePaymentRequirements({ ...requirements, payTo: '' }).payTo).toBe('')
    expect(() => parsePaymentRequirements({ ...requirements, scheme: '' })).toThrow()
  })
})

describe('extensions.x402interop', () => {
  it('builds and reads the extension', () => {
    const extension = x402InteropExtension(quote)
    expect(parseX402InteropExtension(extension).info.quoteId).toBe('q-1')
    expect(readX402InteropExtension({ x402interop: extension })?.info.depositAddress).toBe(
      quote.depositAddress,
    )
  })

  it('returns undefined for missing or malformed extensions', () => {
    expect(readX402InteropExtension(undefined)).toBeUndefined()
    expect(readX402InteropExtension({})).toBeUndefined()
    expect(readX402InteropExtension({ x402interop: 'nope' })).toBeUndefined()
    expect(readX402InteropExtension({ x402interop: null })).toBeUndefined()
    expect(readX402InteropExtension({ x402interop: [] })).toBeUndefined()
    expect(readX402InteropExtension({ x402interop: { info: 'x' } })).toBeUndefined()
  })
})

describe('scheme ids', () => {
  it('names TON tvm and recognises the family', () => {
    expect(SCHEME_IDS.ton).toBe('x402interop-tvm')
    expect(isInteropScheme('x402interop-evm')).toBe(true)
    expect(isInteropScheme('exact')).toBe(false)
    expect(familyForScheme('x402interop-svm')).toBe('svm')
    expect(familyForScheme('exact')).toBeUndefined()
  })

  it('describes a known scheme and ignores unknown ids', () => {
    expect(summaryForScheme(SCHEME_IDS.near)).toMatch(/NEP-366/)
    expect(summaryForScheme('exact')).toBeUndefined()
  })

  it('accepts a binding that pins the quote and rejects tampering', () => {
    const binding: X402InteropBinding = {
      quoteId: 'q-1',
      depositAddress: 'deposit',
      nonce: 'abc',
      expiresAt: '2026-10-27T12:00:00Z',
    }
    const bindingQuote = {
      quoteId: 'q-1',
      depositAddress: 'deposit',
      expiresAt: '2026-10-27T12:00:00Z',
    }
    expect(bindingMatchesQuote(binding, bindingQuote)).toBe(true)
    expect(bindingMatchesQuote({ ...binding, quoteId: 'other' }, bindingQuote)).toBe(false)
    expect(bindingMatchesQuote({ ...binding, depositAddress: 'other' }, bindingQuote)).toBe(false)
    expect(
      bindingMatchesQuote({ ...binding, expiresAt: '2026-10-27T13:00:00Z' }, bindingQuote),
    ).toBe(false)
    expect(bindingMatchesQuote({ ...binding, nonce: '' }, bindingQuote)).toBe(false)
  })
})

describe('network catalogue', () => {
  it('covers every chain family with a canonical mainnet first', () => {
    for (const family of Object.keys(NETWORK_CATALOGUE)) {
      const networks = networksForFamily(family as keyof typeof NETWORK_CATALOGUE)
      expect(networks.length).toBeGreaterThan(0)
      expect(defaultNetworkForFamily(family as keyof typeof NETWORK_CATALOGUE)).toBe(networks[0])
    }
    expect(ALL_NETWORKS).toContain('eip155:8453')
    expect(ALL_NETWORKS).toContain('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
  })

  it('covers the day-one corridor set (26 chains)', () => {
    const evm = [
      'eip155:1',
      'eip155:10',
      'eip155:56',
      'eip155:137',
      'eip155:143',
      'eip155:196',
      'eip155:9745',
      'eip155:8453',
      'eip155:80094',
      'eip155:42161',
      'eip155:43114',
      'eip155:534352',
    ]
    const utxo = [
      'bip122:000000000019d6689c085ae165831e93',
      'bip122:000000000000000000651ef99cb9fcbe',
      'bip122:12a765e31ffd4059bada1e25190f6e98',
      'bip122:00000ffd590b1485b3caadc19b22e637',
      'bip122:00040fe8ec8471911baa1db1266ea15d',
      'bip122:1a91e3dace36e2be3bf030a65679fe82',
    ]
    const l1s = [
      'aptos:1',
      'near:mainnet',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      'stellar:pubnet',
      'sui:mainnet',
      'tvm:-239',
      'tron:728126428',
      'xrpl:0',
      'starknet:SN_MAIN',
    ]
    for (const network of [...evm, ...utxo, ...l1s]) {
      expect(ALL_NETWORKS).toContain(network)
    }
    expect(ALL_NETWORKS).toContain('lnbtc:000000000019d6689c085ae165831e93')
    // 12 evm + 6 utxo + 10 other l1s + lightning = 29 mainnet ids
    expect(ALL_NETWORKS).toHaveLength(evm.length + utxo.length + l1s.length + 1)
  })

  it('resolves new families from the CAIP-2 namespace', () => {
    expect(familyForNetwork('aptos:1')).toBe('aptos')
    expect(familyForNetwork('stellar:pubnet')).toBe('stellar')
    expect(familyForNetwork('starknet:SN_MAIN')).toBe('starknet')
    expect(familyForNetwork('bip122:1a91e3dace36e2be3bf030a65679fe82')).toBe('utxo')
    expect(familyForNetwork('lnbtc:000000000019d6689c085ae165831e93')).toBe('lightning')
    expect(familyForNetwork('unknown:1')).toBeUndefined()
  })

  it('resolves a family from the CAIP-2 namespace', () => {
    expect(familyForNetwork('eip155:8453')).toBe('evm')
    expect(familyForNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('svm')
    expect(familyForNetwork('tvm:-239')).toBe('ton')
    expect(familyForNetwork('tron:728126428')).toBe('tron')
  })

  it('normalises v0 ids and rejects unknown networks', () => {
    expect(normalizeNetwork('solana:mainnet')).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
    expect(normalizeNetwork('ton:mainnet')).toBe('tvm:-239')
    expect(normalizeNetwork('xrpl:mainnet')).toBe('xrpl:0')
    expect(normalizeNetwork('base')).toBe('eip155:8453')
    expect(normalizeNetwork('lightning:mainnet')).toBe('lnbtc:000000000019d6689c085ae165831e93')
    expect(normalizeNetwork('bitcoin')).toBe('bip122:000000000019d6689c085ae165831e93')
    expect(isKnownNetwork('tron:mainnet')).toBe(true)
    expect(isKnownNetwork('eip155:999999')).toBe(false)
    expect(assertKnownNetwork('tron:0x2b6653dc')).toBe('tron:728126428')
    expect(() => assertKnownNetwork('eip155:999999')).toThrow(/Unknown network/)
  })

  it('keeps aliases distinct from canonical ids', () => {
    // Testnet aliases normalise to testnet ids that are intentionally not in
    // the mainnet-only ALL_NETWORKS set.
    const testnetAliases = new Set([
      'solana:devnet',
      'solana:testnet',
      'ton:testnet',
      'xrpl:testnet',
      'xrpl:devnet',
      'lnbtc:testnet',
      'lightning:testnet',
    ])
    for (const [alias, canonical] of Object.entries(NETWORK_ALIASES)) {
      if (!testnetAliases.has(alias)) expect(ALL_NETWORKS).toContain(canonical)
      expect(ALL_NETWORKS).not.toContain(alias)
    }
  })
})

describe('asset catalogue', () => {
  it('lists every day-one asset with a NEAR Intents id', () => {
    for (const asset of ASSETS) {
      expect(asset.intentsAssetId.length).toBeGreaterThan(0)
      expect(asset.decimals).toBeGreaterThan(0)
    }
    // 74 curated entries: 40 evm + 6 utxo + 6 aptos + 7 near + 5 svm + 2 stellar + 2 sui + 2 ton + 1 xrp + 3 starknet
    expect(ASSETS).toHaveLength(74)
  })

  it('prefers the stablecoin on chains that have one', () => {
    expect(preferredAssetForNetwork('eip155:8453')?.symbol).toBe('USDC')
    expect(preferredAssetForNetwork('eip155:80094')?.symbol).toBe('USDT0')
    expect(preferredAssetForNetwork('eip155:56')?.symbol).toBe('BNB')
    expect(preferredAssetForNetwork('bip122:000000000019d6689c085ae165831e93')?.symbol).toBe('BTC')
    expect(preferredAssetForNetwork('xrpl:0')?.symbol).toBe('XRP')
    expect(preferredAssetForNetwork('starknet:SN_MAIN')?.symbol).toBe('STRK')
  })

  it('finds assets by symbol and by intent id', () => {
    expect(findAsset('near:mainnet', 'wNEAR')?.intentsAssetId).toBe('nep141:wrap.near')
    expect(findAsset('aptos:1', 'USDT')?.stablecoin).toBe(true)
    expect(findAssetByIntentId('nep141:btc.omft.near')?.network).toBe(
      'bip122:000000000019d6689c085ae165831e93',
    )
    expect(findAsset('eip155:534352', 'USDT0')).toBeUndefined()
    expect(assetsForFamily('utxo')).toHaveLength(6)
    expect(assetsForFamily('evm').length).toBeGreaterThan(30)
  })

  it('returns empty lists for unknown networks', () => {
    expect(assetsForNetwork('eip155:999999')).toEqual([])
    expect(preferredAssetForNetwork('eip155:999999')).toBeUndefined()
  })
})
