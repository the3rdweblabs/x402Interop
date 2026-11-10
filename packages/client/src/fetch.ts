// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Drop-in interop for x402-native buyers. `createInteropClient` builds the
 * upstream `x402Client` (from `@x402/core/client`) with every interop scheme
 * registered as a `SchemeNetworkClient`, and `wrapFetchWithInterop` powers
 * the standard x402 fetch loop with it. Same shapes, same headers, same
 * `PAYMENT-SIGNATURE` - zero upstream client changes for same-chain `exact`.
 */

import { x402Client as X402Client, x402HTTPClient } from '@x402/core/client'
import {
  createInteropClient as createAdptInteropClient,
  DEFAULT_SCHEMES,
  INTEROP_SCHEMES,
  entryForFamily,
} from '@x402interop/adpt'
import {
  NETWORK_CATALOGUE,
  familyForScheme,
  type ChainFamily,
  type Network,
} from '@x402interop/core'

export type { ChainFamily, Network }

export interface InteropSigner {
  sign(
    authorization: Record<string, unknown>,
  ): Promise<Record<string, unknown>> | Record<string, unknown>
  signerAddress(): string
}

export interface CreateInteropClientOptions {
  signers?: Partial<Record<ChainFamily, InteropSigner>>
  /** Networks to register interop schemes for; defaults to every day-one mainnet. */
  networks?: 'all' | Network[]
  excludeSchemes?: string[]
  excludeNetworks?: Network[]
  /** Upstream x402Client spend controls; omitted → upstream defaults. */
  spendControls?: any
  /** Client selector override; omitted → upstream first-option default. */
  paymentRequirementsSelector?: unknown
}

export interface InteropHttpClient {
  client: X402Client
  http: x402HTTPClient
}

/** Register interop scheme clients onto any `x402Client` (or duck-typed like one). */
export function registerInteropHandlers(
  target: { register(network: Network, client: unknown): unknown },
  options: CreateInteropClientOptions = {},
): void {
  const networks = resolveNetworks(options)
  const families = new Set<ChainFamily>()
  for (const scheme of INTEROP_SCHEMES) {
    if (options.excludeSchemes?.includes(scheme)) continue
    const family = familyForScheme(scheme)
    if (!family) continue
    families.add(family)
  }
  for (const family of families) {
    const signer = options.signers?.[family]
    const clientImplementation = createAdptInteropClient(family, { signer })
    for (const network of networksFor(family, networks)) {
      target.register(network, clientImplementation)
    }
  }
}

function resolveNetworks(options: CreateInteropClientOptions): Network[] {
  if (options.networks === undefined || options.networks === 'all') {
    return Object.values(NETWORK_CATALOGUE).flat() as Network[]
  }
  return options.networks
}

function networksFor(family: ChainFamily, networks: Network[]): Network[] {
  return networks.filter((network) => network.startsWith(namespaceOf(family)))
}

function namespaceOf(family: ChainFamily): string {
  return `${entryForFamily(family)?.caipNamespace ?? family}:`
}

/** Build the upstream x402Client with all interop schemes registered. */
export function createInteropClient(options: CreateInteropClientOptions = {}): InteropHttpClient {
  const schemes: { network: Network; client: unknown }[] = []
  const networkTarget = {
    register(network: Network, client: unknown) {
      schemes.push({ network, client })
    },
  }
  registerInteropHandlers(networkTarget as never, options)
  const config: Record<string, unknown> = { schemes }
  if (options.spendControls !== undefined) config.spendControls = options.spendControls
  if (options.paymentRequirementsSelector !== undefined) {
    config.paymentRequirementsSelector = options.paymentRequirementsSelector
  }
  const client = X402Client.fromConfig(config as never)
  return { client, http: new x402HTTPClient(client) }
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface WrapFetchWithInteropOptions extends CreateInteropClientOptions {
  /** Existing x402Client you already built (e.g. with upstream exact schemes). */
  client?: X402Client
  /** Existing HTTP helper, e.g. one carrying your own payment-required hooks. */
  http?: x402HTTPClient
}

/**
 * The zero-change buyer path: swap `wrapFetchWithPayment` for this and keep
 * the same underlying client. When no client is supplied, one is built with
 * every interop scheme registered and upstream defaults.
 */
export function wrapFetchWithInterop(
  fetchImpl: FetchLike,
  options: WrapFetchWithInteropOptions = {},
): FetchLike {
  let built: InteropHttpClient | undefined
  const buildOwn = () => (built ??= createInteropClient(options))
  const httpClient =
    options.http ?? (options.client ? new x402HTTPClient(options.client) : buildOwn().http)
  return async function interopFetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const first = await fetchImpl(input, init)
    if (first.status !== 402) return first
    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url
    const body = await first.text()
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(body)
    } catch {
      parsedBody = undefined
    }
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => first.headers.get(name),
      parsedBody,
    )
    const hookHeaders = await httpClient.handlePaymentRequired(paymentRequired, url)
    if (hookHeaders) {
      return fetchImpl(input, mergeInit(init, hookHeaders))
    }
    const payload = await httpClient.createPaymentPayload(paymentRequired)
    const signatureHeaders = httpClient.encodePaymentSignatureHeader(payload)
    return fetchImpl(input, mergeInit(init, signatureHeaders))
  }
}

function mergeInit(init: RequestInit | undefined, headers: Record<string, string>): RequestInit {
  const existing: Record<string, string> = {}
  const incoming = init?.headers
  if (Array.isArray(incoming)) {
    for (const [key, value] of incoming) existing[String(key)] = String(value)
  } else if (incoming && typeof incoming === 'object') {
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      existing[key] = String(value)
    }
  }
  return { ...init, headers: { ...existing, ...headers } }
}

export { DEFAULT_SCHEMES, INTEROP_SCHEMES }
