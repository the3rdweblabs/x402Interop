// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/** Human names for the CAIP-2 ids in the core catalogue. Unknown ids fall back to the id. */
const NAMES: Record<string, string> = {
  'eip155:8453': 'Base',
  'eip155:42161': 'Arbitrum One',
  'eip155:1': 'Ethereum',
  'eip155:10': 'Optimism',
  'eip155:137': 'Polygon',
  'eip155:43114': 'Avalanche',
  'eip155:56': 'BNB Chain',
  'eip155:80094': 'Berachain',
  'eip155:9745': 'Plasma',
  'eip155:143': 'Monad',
  'eip155:196': 'X Layer',
  'eip155:534352': 'Scroll',
  'sui:mainnet': 'Sui',
  'near:mainnet': 'NEAR',
  'tron:728126428': 'Tron',
  'xrpl:0': 'XRP Ledger',
  'aptos:1': 'Aptos',
  'stellar:pubnet': 'Stellar',
  'starknet:SN_MAIN': 'Starknet',
  'tvm:-239': 'TON',
}

export function labelForNetwork(network: string): string {
  if (NAMES[network]) return NAMES[network] as string
  if (network.startsWith('solana:')) return 'Solana'
  if (network.startsWith('bip122:')) return 'Bitcoin-family'
  if (network.startsWith('lnbtc:')) return 'Lightning'
  return network
}
