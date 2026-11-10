// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Bazaar-style marketplace helpers over the facilitator's discovery endpoints
 * (`GET/POST /discovery/resources`, `GET /discovery/merchants`). Browser-safe
 * global fetch, mirroring the GoPlausible Bazaar surface.
 */

import { facilitatorUrl } from './facilitator.js'

export interface Resource {
  id: string
  name: string
  description: string
  price: string
  networks: string[]
  asset: string
  owner: string
  payTo?: string
  resourceUrl: string
  category?: string
  tags?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  documentationUrl?: string
  repositoryUrl?: string
  verified?: boolean
  updatedAt?: string
  health?: string
}

export interface ResourcesPage {
  resources: Resource[]
  total: number
  limit: number
  offset: number
}

export interface Merchant {
  owner: string
  count: number
  networks: string[]
  assets: string[]
}

export interface ResourceInput {
  name: string
  description: string
  price: string
  networks: string[]
  asset: string
  owner: string
  payTo?: string
  resourceUrl: string
  category?: string
  tags?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  documentationUrl?: string
  repositoryUrl?: string
  paymentNetwork?: string
  paymentAsset?: string
}

export interface MarketplaceFees {
  free?: boolean
  registration: Array<{
    network: string
    asset: string
    amount: string
    treasury: string
    symbol?: string
  }>
  featured: {
    '30d': Array<{
      network: string
      asset: string
      amount: string
      treasury: string
      symbol?: string
    }>
    '60d': Array<{
      network: string
      asset: string
      amount: string
      treasury: string
      symbol?: string
    }>
  }
}

async function fetchJson<T>(path: string, init: RequestInit = {}, base?: string): Promise<T> {
  const response = await fetch(`${base ?? facilitatorUrl()}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    const detail = await errorDetail(response)
    throw new Error(
      `discovery returned ${response.status} ${response.statusText} for ${path}${detail ? `: ${detail}` : ''}`,
    )
  }
  return (await response.json()) as T
}

/** Server-supplied message from an error body, when one is present and short. */
async function errorDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown }
    const message = typeof body.message === 'string' ? body.message : undefined
    const code = typeof body.error === 'string' ? body.error : undefined
    return (message ?? code)?.slice(0, 300)
  } catch {
    return undefined
  }
}

export function searchResources(
  query: {
    q?: string
    network?: string
    asset?: string
    category?: string
    owner?: string
    maxPrice?: string
    limit?: number
    offset?: number
  } = {},
  base?: string,
): Promise<ResourcesPage> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return fetchJson<ResourcesPage>(
    `/discovery/resources${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
    base,
  )
}

export function fetchMarketplaceFees(base?: string): Promise<MarketplaceFees> {
  return fetchJson<MarketplaceFees>('/marketplace/fees', { method: 'GET' }, base)
}

export function getResource(id: string, base?: string): Promise<{ resource: Resource }> {
  return fetchJson<{ resource: Resource }>(
    `/discovery/resources/${encodeURIComponent(id)}`,
    { method: 'GET' },
    base,
  )
}

export function listMerchants(base?: string): Promise<{ merchants: Merchant[] }> {
  return fetchJson<{ merchants: Merchant[] }>('/discovery/merchants', { method: 'GET' }, base)
}

export function registerResource(
  input: ResourceInput,
  base?: string,
  auth: { apiKey?: string; signature?: string; paymentSignature?: string } = {},
): Promise<{ ok: boolean; resource: Resource }> {
  return fetchJson<{ ok: boolean; resource: Resource }>(
    '/discovery/resources',
    {
      method: 'POST',
      body: JSON.stringify(input),
      headers: {
        ...(auth.apiKey ? { authorization: `Bearer ${auth.apiKey}` } : {}),
        ...(auth.signature ? { 'x-x402interop-signature': auth.signature } : {}),
        ...(auth.paymentSignature ? { 'payment-signature': auth.paymentSignature } : {}),
      },
    },
    base,
  )
}

export function updateResource(
  id: string,
  input: Partial<ResourceInput>,
  base?: string,
  auth: { apiKey?: string; signature?: string } = {},
): Promise<{ ok: boolean; resource: Resource }> {
  return fetchJson<{ ok: boolean; resource: Resource }>(
    `/discovery/resources/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: {
        ...(auth.apiKey ? { authorization: `Bearer ${auth.apiKey}` } : {}),
        ...(auth.signature ? { 'x-x402interop-signature': auth.signature } : {}),
      },
    },
    base,
  )
}

export function deleteResource(
  id: string,
  base?: string,
  auth: { apiKey?: string; signature?: string } = {},
): Promise<{ ok: boolean; id: string }> {
  return fetchJson<{ ok: boolean; id: string }>(
    `/discovery/resources/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        ...(auth.apiKey ? { authorization: `Bearer ${auth.apiKey}` } : {}),
        ...(auth.signature ? { 'x-x402interop-signature': auth.signature } : {}),
      },
    },
    base,
  )
}

export function checkResourceHealth(
  id: string,
  base?: string,
  auth: { apiKey?: string; signature?: string } = {},
): Promise<{ ok: boolean; resource: Resource }> {
  return fetchJson<{ ok: boolean; resource: Resource }>(
    `/discovery/resources/${encodeURIComponent(id)}/health`,
    {
      method: 'POST',
      headers: {
        ...(auth.apiKey ? { authorization: `Bearer ${auth.apiKey}` } : {}),
        ...(auth.signature ? { 'x-x402interop-signature': auth.signature } : {}),
      },
    },
    base,
  )
}
