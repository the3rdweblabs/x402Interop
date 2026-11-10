// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

export interface MarketplacePrincipal {
  owner: string
  method: 'api_key' | 'wallet_signature'
}

export interface MarketplaceAuthRequest {
  method: string
  path: string
  body: unknown
  headers: Record<string, string | undefined>
}

export interface MarketplaceAuthenticator {
  authenticate(request: MarketplaceAuthRequest): Promise<MarketplacePrincipal | undefined>
}

export interface WalletSignatureVerifier {
  verify(request: MarketplaceAuthRequest, signature: string): Promise<string | undefined>
}

export interface CreateMarketplaceAuthenticatorOptions {
  apiKeys?: Record<string, string>
  walletSignatureVerifier?: WalletSignatureVerifier
}

/** Build the default dual-mode authenticator. No signature scheme is guessed. */
export function createMarketplaceAuthenticator(
  options: CreateMarketplaceAuthenticatorOptions = {},
): MarketplaceAuthenticator {
  const apiKeys = options.apiKeys ?? readApiKeysFromEnvironment()
  return {
    async authenticate(request) {
      const authorization = request.headers.authorization
      const apiKey =
        request.headers['x-x402interop-api-key'] ??
        (authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined)
      if (apiKey) {
        const owner = apiKeys[apiKey]
        if (owner) return { owner, method: 'api_key' }
      }

      const signature = request.headers['x-x402interop-signature']
      if (signature && options.walletSignatureVerifier) {
        const owner = await options.walletSignatureVerifier.verify(request, signature)
        if (owner) return { owner, method: 'wallet_signature' }
      }
      return undefined
    },
  }
}

function readApiKeysFromEnvironment(): Record<string, string> {
  const raw = process.env.X402INTEROP_API_KEYS ?? ''
  const result: Record<string, string> = {}
  for (const entry of raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf('=')
    if (separator <= 0 || separator === entry.length - 1) continue
    result[entry.slice(0, separator)] = entry.slice(separator + 1)
  }
  return result
}
