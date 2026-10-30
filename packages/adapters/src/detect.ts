// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

export function detectFamilyFromScheme(scheme: string): string | undefined {
  if (scheme.startsWith('x402interop-')) {
    const family = scheme.replace('x402interop-', '')
    if (family === 'evm') return 'evm'
    if (family === 'svm') return 'svm'
    if (family === 'sui') return 'sui'
    if (family === 'near') return 'near'
    if (family === 'tvm' || family === 'ton') return 'ton'
    if (family === 'tron') return 'tron'
    if (family === 'xrpl') return 'xrpl'
    if (family === 'lightning') return 'lightning'
    return family
  }
  if (scheme === 'exact') {
    // Will be resolved by network
    return undefined
  }
  return undefined
}

export function detectFamilyFromNetwork(network: string): string | undefined {
  if (network.startsWith('eip155:')) return 'evm'
  if (network.startsWith('solana:')) return 'svm'
  if (network.startsWith('sui:')) return 'sui'
  if (network.startsWith('near:')) return 'near'
  if (network.startsWith('ton:')) return 'ton'
  if (network.startsWith('tron:') || network.startsWith('tvm:')) return 'tron'
  if (network.startsWith('xrpl:')) return 'xrpl'
  if (network.startsWith('lightning:') || network.startsWith('bip122:')) return 'lightning'
  return undefined
}
