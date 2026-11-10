// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Typed HTTP helpers for the running x402Interop facilitator. Browser-safe:
 * only the global `fetch` is used, never Node imports, and no request data is
 * logged. The facilitator URL defaults to the local shell
 * (`http://127.0.0.1:4020`) and can be overridden with the public
 * `PUBLIC_FACILITATOR_URL` variable at build/dev time via `import.meta.env`.
 */

export const DEFAULT_FACILITATOR_URL = 'http://127.0.0.1:4020'

/** Base URL of the facilitator, with trailing slashes trimmed. */
export function facilitatorUrl(): string {
  const configured =
    (import.meta as { env?: ImportMetaEnv }).env?.PUBLIC_FACILITATOR_URL ??
    (typeof process !== 'undefined' ? process.env.PUBLIC_FACILITATOR_URL : undefined)
  return (configured ?? DEFAULT_FACILITATOR_URL).replace(/\/+$/, '')
}

export interface SupportedKind {
  x402Version: number
  scheme: string
  network: string
  extra?: Record<string, unknown>
}

export interface SupportedKindsResponse {
  kinds: SupportedKind[]
  extensions: string[]
  signers: Record<string, string[]>
}

export interface HealthResponse {
  status: string
  service: string
}

export interface QuoteInput {
  sellerNetwork: string
  sellerAsset: string
  sellerAddress: string
  amount: string
  buyerNetwork: string
  buyerAsset: string
  buyerAddress: string
  deliveryMode: 'on_deposit' | 'on_success' | 'pending_push'
}

export interface QuoteResult {
  scheme: string
  quoteId: string
  depositAddress: string
  originNetwork: string
  originAsset: string
  originAmount: string
  expiresAt: string
  timeEstimateSeconds: number
  schemeSummary?: string
  extensions?: unknown
}

async function fetchJson<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: string,
  base?: string,
): Promise<T> {
  const response = await fetch(`${base ?? facilitatorUrl()}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body }),
  })
  if (!response.ok) {
    throw new Error(`Facilitator returned ${response.status} ${response.statusText} for ${path}`)
  }
  const payload = (await response.json()) as T & { error?: unknown }
  if (payload?.error) {
    throw new Error(`Facilitator rejected ${path}: ${JSON.stringify(payload.error)}`)
  }
  return payload
}

export function fetchHealth(url?: string): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/health', 'GET', undefined, url)
}

export function fetchSupportedKinds(url?: string): Promise<SupportedKindsResponse> {
  return fetchJson<SupportedKindsResponse>('/supported', 'GET', undefined, url)
}

export function requestQuote(input: QuoteInput, url?: string): Promise<QuoteResult> {
  return fetchJson<QuoteResult>('/interop/quote', 'POST', JSON.stringify(input), url)
}
