// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

let cachedTokens: any[] | null = null
let cacheTime = 0
const CACHE_TTL = 60000 // 1 minute

export async function fetchTokens(baseUrl = 'https://1click.chaindefuser.com') {
  const now = Date.now()
  if (cachedTokens && now - cacheTime < CACHE_TTL) {
    return cachedTokens
  }
  try {
    const res = await fetch(`${baseUrl}/v0/tokens`)
    if (res.ok) {
      cachedTokens = await res.json()
      cacheTime = now
      return cachedTokens
    }
  } catch {}
  return cachedTokens || []
}

export async function resolveAssetId(
  symbol: string,
  blockchain: string,
  baseUrl?: string,
): Promise<string | undefined> {
  const tokens = await fetchTokens(baseUrl)
  const match = tokens.find(
    (t: any) =>
      t.symbol?.toUpperCase() === symbol.toUpperCase() &&
      t.blockchain?.toLowerCase() === blockchain.toLowerCase(),
  )
  return match?.assetId
}

export function mapChainToBlockchain(chain: string): string {
  if (chain.startsWith('eip155:')) {
    const id = chain.split(':')[1]
    if (id === '8453') return 'base'
    if (id === '1') return 'eth'
    if (id === '42161') return 'arb'
    if (id === '137') return 'pol'
    return 'eth'
  }
  if (chain.startsWith('solana:')) return 'sol'
  if (chain.startsWith('sui:')) return 'sui'
  if (chain.startsWith('near:')) return 'near'
  if (chain.startsWith('ton:')) return 'ton'
  if (chain.startsWith('tron:')) return 'tron'
  if (chain.startsWith('xrpl:')) return 'xrp'
  if (chain.startsWith('lightning:')) return 'btc'
  return chain
}
