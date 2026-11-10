// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

export function detectFamilyFromScheme(scheme: string): string | undefined {
  if (scheme === 'exact') return undefined // resolved by network
  if (!scheme.startsWith('x402interop-')) return undefined
  const family = scheme.replace('x402interop-', '')
  if (family === 'tvm' || family === 'ton') return 'ton'
  const known = new Set([
    'evm',
    'svm',
    'sui',
    'near',
    'tron',
    'xrpl',
    'aptos',
    'stellar',
    'starknet',
    'lightning',
    'utxo',
  ])
  return known.has(family) ? family : undefined
}

export function detectFamilyFromNetwork(network: string): string | undefined {
  if (network.startsWith('eip155:')) return 'evm'
  if (network.startsWith('solana:')) return 'svm'
  if (network.startsWith('sui:')) return 'sui'
  if (network.startsWith('near:')) return 'near'
  if (network.startsWith('tvm:') || network.startsWith('ton:')) return 'ton'
  if (network.startsWith('tron:')) return 'tron'
  if (network.startsWith('xrpl:')) return 'xrpl'
  if (network.startsWith('aptos:')) return 'aptos'
  if (network.startsWith('stellar:')) return 'stellar'
  if (network.startsWith('starknet:')) return 'starknet'
  if (network.startsWith('lnbtc:') || network.startsWith('lightning:')) return 'lightning'
  if (network.startsWith('bip122:')) return 'utxo'
  return undefined
}
