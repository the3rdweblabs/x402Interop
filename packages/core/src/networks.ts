// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { Network } from '@x402/core/types'

import type { ChainFamily } from './schemes.js'

/**
 * Curated CAIP-2 catalogue for the day-one NEAR Intents corridor set.
 *
 * Only mainnets are listed. NEAR Intents has no testnet, so a testnet entry
 * would be advertised as payable when no solver can actually fill it. Pass a
 * testnet explicitly through `familyNetworks` when developing locally.
 *
 * Order matters: the first entry in each family is the default network.
 */
export const EVM_NETWORKS = [
  'eip155:8453', // Base
  'eip155:42161', // Arbitrum One
  'eip155:1', // Ethereum
  'eip155:10', // Optimism
  'eip155:137', // Polygon
  'eip155:43114', // Avalanche C-Chain
  'eip155:56', // BNB Smart Chain
  'eip155:80094', // Berachain
  'eip155:9745', // Plasma
  'eip155:143', // Monad
  'eip155:196', // X Layer
  'eip155:534352', // Scroll
] as const satisfies readonly Network[]

export const SVM_NETWORKS = [
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // mainnet-beta
] as const satisfies readonly Network[]

export const SUI_NETWORKS = ['sui:mainnet'] as const satisfies readonly Network[]

export const NEAR_NETWORKS = ['near:mainnet'] as const satisfies readonly Network[]

export const TON_NETWORKS = ['tvm:-239'] as const satisfies readonly Network[]

export const TRON_NETWORKS = ['tron:728126428'] as const satisfies readonly Network[]

export const XRPL_NETWORKS = ['xrpl:0'] as const satisfies readonly Network[]

export const APTOS_NETWORKS = ['aptos:1'] as const satisfies readonly Network[]

export const STELLAR_NETWORKS = ['stellar:pubnet'] as const satisfies readonly Network[]

export const STARKNET_NETWORKS = ['starknet:SN_MAIN'] as const satisfies readonly Network[]

/**
 * Lightning uses the `lnbtc` namespace from the x402 `exact` spec. The
 * reference is the first 32 hex characters of the Bitcoin genesis hash.
 */
export const LIGHTNING_NETWORKS = [
  'lnbtc:000000000019d6689c085ae165831e93',
] as const satisfies readonly Network[]

/**
 * UTXO chains use BIP-122 references: the first 16 bytes of each genesis
 * block hash, as defined by the BIP-122 CAIP-2 namespace.
 */
export const UTXO_NETWORKS = [
  'bip122:000000000019d6689c085ae165831e93', // Bitcoin
  'bip122:000000000000000000651ef99cb9fcbe', // Bitcoin Cash
  'bip122:12a765e31ffd4059bada1e25190f6e98', // Litecoin
  'bip122:00000ffd590b1485b3caadc19b22e637', // Dash
  'bip122:00040fe8ec8471911baa1db1266ea15d', // Zcash
  'bip122:1a91e3dace36e2be3bf030a65679fe82', // Dogecoin
] as const satisfies readonly Network[]

export const NETWORK_CATALOGUE = {
  evm: EVM_NETWORKS,
  svm: SVM_NETWORKS,
  sui: SUI_NETWORKS,
  near: NEAR_NETWORKS,
  ton: TON_NETWORKS,
  tron: TRON_NETWORKS,
  xrpl: XRPL_NETWORKS,
  aptos: APTOS_NETWORKS,
  stellar: STELLAR_NETWORKS,
  starknet: STARKNET_NETWORKS,
  lightning: LIGHTNING_NETWORKS,
  utxo: UTXO_NETWORKS,
} as const satisfies Record<ChainFamily, readonly Network[]>

export const ALL_NETWORKS: readonly Network[] = Object.values(NETWORK_CATALOGUE).flat()

/**
 * Explicit same-chain testnet profiles. These are never included in
 * NETWORK_CATALOGUE or advertised by default, and are not supported by
 * NEAR Intents.
 */
export const TESTNET_NETWORK_CATALOGUE = {
  evm: [
    'eip155:84532', // Base Sepolia
    'eip155:11155111', // Ethereum Sepolia
    'eip155:421614', // Arbitrum Sepolia
    'eip155:11155420', // Optimism Sepolia
    'eip155:80002', // Polygon Amoy
  ],
  svm: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'], // devnet
  sui: ['sui:testnet'],
  near: [],
  ton: ['tvm:-3'],
  tron: ['tron:2494104990'],
  xrpl: ['xrpl:1'],
  aptos: ['aptos:testnet'],
  stellar: ['stellar:testnet'],
  starknet: ['starknet:SN_SEPOLIA'],
  lightning: ['lnbtc:000000000933ea01ad0ee984209779ba'],
  utxo: [],
} as const satisfies Record<ChainFamily, readonly Network[]>

export const ALL_TESTNET_NETWORKS: readonly Network[] =
  Object.values(TESTNET_NETWORK_CATALOGUE).flat()

export function isTestnetNetwork(network: Network): boolean {
  return ALL_TESTNET_NETWORKS.includes(normalizeNetwork(network))
}

/**
 * Ids used by earlier v0 releases and by older 1Click examples. They are accepted
 * on input and normalised to the canonical CAIP-2 id before a requirement is
 * built.
 */
export const NETWORK_ALIASES: Readonly<Record<string, Network>> = {
  base: 'eip155:8453',
  ethereum: 'eip155:1',
  arbitrum: 'eip155:42161',
  optimism: 'eip155:10',
  polygon: 'eip155:137',
  avalanche: 'eip155:43114',
  bnb: 'eip155:56',
  berachain: 'eip155:80094',
  plasma: 'eip155:9745',
  monad: 'eip155:143',
  xlayer: 'eip155:196',
  'x-layer': 'eip155:196',
  scroll: 'eip155:534352',
  'solana:mainnet': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana:devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'solana:testnet': 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
  'ton:mainnet': 'tvm:-239',
  'ton:testnet': 'tvm:-3',
  'tron:mainnet': 'tron:728126428',
  'tron:0x2b6653dc': 'tron:728126428',
  'xrpl:mainnet': 'xrpl:0',
  'xrpl:testnet': 'xrpl:1',
  'xrpl:devnet': 'xrpl:2',
  'lightning:mainnet': 'lnbtc:000000000019d6689c085ae165831e93',
  'lnbtc:mainnet': 'lnbtc:000000000019d6689c085ae165831e93',
  'lnbtc:testnet': 'lnbtc:000000000933ea01ad0ee984209779ba',
  'lightning:testnet': 'lnbtc:000000000933ea01ad0ee984209779ba',
  bitcoin: 'bip122:000000000019d6689c085ae165831e93',
  btc: 'bip122:000000000019d6689c085ae165831e93',
  'bitcoin-cash': 'bip122:000000000000000000651ef99cb9fcbe',
  bch: 'bip122:000000000000000000651ef99cb9fcbe',
  litecoin: 'bip122:12a765e31ffd4059bada1e25190f6e98',
  ltc: 'bip122:12a765e31ffd4059bada1e25190f6e98',
  dash: 'bip122:00000ffd590b1485b3caadc19b22e637',
  zcash: 'bip122:00040fe8ec8471911baa1db1266ea15d',
  zec: 'bip122:00040fe8ec8471911baa1db1266ea15d',
  dogecoin: 'bip122:1a91e3dace36e2be3bf030a65679fe82',
  doge: 'bip122:1a91e3dace36e2be3bf030a65679fe82',
}

const PREFIX_FAMILY: Readonly<Record<string, ChainFamily>> = {
  eip155: 'evm',
  solana: 'svm',
  sui: 'sui',
  near: 'near',
  tvm: 'ton',
  tron: 'tron',
  xrpl: 'xrpl',
  aptos: 'aptos',
  stellar: 'stellar',
  starknet: 'starknet',
  lnbtc: 'lightning',
  lightning: 'lightning',
  bip122: 'utxo',
}

/** Map a legacy id to its canonical CAIP-2 form. Unknown ids pass through. */
export function normalizeNetwork(network: string): Network {
  return NETWORK_ALIASES[network] ?? (network as Network)
}

export function networksForFamily(family: ChainFamily): readonly Network[] {
  return NETWORK_CATALOGUE[family]
}

/** Resolve the family from the CAIP-2 namespace, including chains not in the catalogue. */
export function familyForNetwork(network: Network): ChainFamily | undefined {
  const [namespace] = normalizeNetwork(network).split(':')
  return namespace ? PREFIX_FAMILY[namespace.toLowerCase()] : undefined
}

export function isKnownNetwork(network: Network): boolean {
  return ALL_NETWORKS.includes(normalizeNetwork(network))
}

export function assertKnownNetwork(network: Network): Network {
  const canonical = normalizeNetwork(network)
  if (!ALL_NETWORKS.includes(canonical)) {
    throw new Error(
      `Unknown network "${network}". Add it to NETWORK_CATALOGUE or pass familyNetworks explicitly.`,
    )
  }
  return canonical
}

export function defaultNetworkForFamily(family: ChainFamily): Network {
  const [network] = NETWORK_CATALOGUE[family]
  if (!network) throw new Error(`No default network for family "${family}"`)
  return network
}
