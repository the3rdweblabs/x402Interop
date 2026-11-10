// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * `createInteropFacilitator()` - the kit for building a facilitator. It owns
 * `routeFacilitator` (health, /supported, /verify, /settle, /interop/quote,
 * /interop/status, /discovery/resources, /discovery/merchants), the MCP
 * surface, the nonce ledger, the restart-durable store, the status tracker
 * and the marketplace catalog. `apps/facilitator` is only an HTTP shell
 * around it.
 */

import { createHash, randomUUID } from 'node:crypto'

import {
  SCHEME_IDS,
  X402_VERSION,
  familyForNetwork,
  normalizeNetwork,
  summaryForScheme,
  type Network,
  type SettleRequest,
  type SupportedKind,
  type VerifyRequest,
} from '@x402interop/core'
import type {
  ExactAdapter,
  NearInteropClient,
  SuiInteropClient,
  SvmInteropClient,
} from '@x402interop/adpt'
import {
  createOneClickClient,
  isSimulatedOneClickClient,
  mintQuote,
  parseQuoteRequest,
  quoteToRequirements,
  type OneClickClient,
  type QuoteRequest,
} from '@x402interop/intents'

import {
  handleMcp,
  listTools,
  type McpHandlerOutcome,
  type McpToolHandlers,
  type PayAndFetchArgs,
  type PreparePaymentArgs,
  type SearchServicesArgs,
} from './mcp.js'
import { createMarketplaceAuthenticator, type MarketplaceAuthenticator } from './auth.js'
import {
  createWalletSignatureVerifier,
  isWalletFamily,
  payToNetworkError,
  WalletChallengeStore,
} from './wallet-auth.js'
import { assertFetchTarget } from './url-guard.js'
import {
  MemoryServicesCatalog,
  parseServiceRecord,
  slugify,
  type ServiceQuery,
} from './services.js'
import { supportedKinds } from './supported.js'
import { FileStore } from './store.js'
import type { FacilitatorStore } from './store.js'
import type { PersistenceBackend } from './persistence.js'
import { MemoryStatusTracker } from './status.js'
import { isTerminal } from './status.js'
import type { SwapState } from './status.js'
import {
  MemoryExposureTracker,
  MemoryRateLimiter,
  type ExposureLimits,
  type RateLimitOptions,
} from './limits.js'
import type { ServiceHealth, ServiceRecord } from './services.js'
import {
  createUpstreamListingPaymentProcessor,
  type ListingFeeOption,
  type ListingPaymentProcessor,
  type MarketplaceFeeConfig,
} from './fees.js'
import {
  facilitatorRequestSchema,
  settlePayment,
  supportedResponse,
  verifyPayment,
  type InteropVerificationOptions,
  type SimulatedDepositRecord,
} from './index.js'

export interface HttpResult {
  status: number
  body: unknown
}

export interface InteropFacilitator {
  routeFacilitator(
    method: string,
    path: string,
    body: unknown,
    headers?: Record<string, string | undefined>,
  ): Promise<HttpResult>
  supportedKinds(): SupportedKind[]
  listTools(): ReturnType<typeof listTools>
  handleMcpRequest(body: string): Promise<HttpResult>
}

export interface CreateInteropFacilitatorOptions {
  intentsClient?: OneClickClient
  store?: FacilitatorStore
  statusTracker?: MemoryStatusTracker
  servicesCatalog?: MemoryServicesCatalog
  supportedKinds?: () => SupportedKind[]
  now?: () => Date
  marketplaceAuthenticator?: MarketplaceAuthenticator
  /** API keys for the default authenticator. Defaults to `X402INTEROP_API_KEYS`. */
  marketplaceApiKeys?: Record<string, string>
  /** Permit listing URLs on private or loopback hosts. Tests only; never enable in production. */
  allowPrivateResourceUrls?: boolean
  /** Public host shown in wallet sign-in messages. Defaults to `localhost:4321`. */
  marketplaceDomain?: string
  serviceHealthChecker?: ServiceHealthChecker
  marketplaceFees?: MarketplaceFeeConfig
  marketplaceFreeListings?: boolean
  listingPaymentProcessor?: ListingPaymentProcessor
  persistence?: PersistenceBackend
  /** Configured exact-scheme adapters, keyed by CAIP-2 network. */
  exactAdapters?: Record<string, ExactAdapter>
  /**
   * Node clients for built-in interop families. Interop verification is local
   * for `svm`, `sui`, and `near`, so each needs a client; a family without one
   * fails closed with `not_implemented` instead of accepting unverified funds.
   */
  interopClients?: {
    svm?: SvmInteropClient
    sui?: SuiInteropClient
    near?: NearInteropClient
  }
  /** Optional per-client rate limit for quote, verify, and settle. */
  rateLimit?: RateLimitOptions
  /** Optional per-buyer/seller on_deposit exposure caps, in atomic units. */
  exposureLimits?: ExposureLimits
  /** Slippage tolerance sent to 1Click, in basis points. Defaults to 100. */
  slippageBps?: number
}

export interface ServiceHealthCheckResult {
  health: ServiceHealth
  message?: string
}

export type ServiceHealthChecker = (service: ServiceRecord) => Promise<ServiceHealthCheckResult>

function createDefaultServiceHealthChecker(allowPrivate: boolean): ServiceHealthChecker {
  return (service) => defaultServiceHealthCheck(service, allowPrivate)
}

async function defaultServiceHealthCheck(
  service: ServiceRecord,
  allowPrivate: boolean,
): Promise<ServiceHealthCheckResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    assertFetchTarget(service.resourceUrl, allowPrivate)
    const response = await fetch(service.resourceUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json, application/*+json, text/plain' },
    })
    if ((response.status >= 200 && response.status < 300) || response.status === 402) {
      return { health: 'healthy', message: `HTTP ${response.status}` }
    }
    return { health: 'unhealthy', message: `HTTP ${response.status}` }
  } catch (error) {
    return {
      health: 'unhealthy',
      message: error instanceof Error ? error.message.slice(0, 500) : 'Health check failed',
    }
  } finally {
    clearTimeout(timer)
  }
}

export function methodOf(method: string | undefined): string {
  return method ?? 'GET'
}

export function requestPath(url: string | undefined): string {
  const raw = url && url.length > 0 ? url : '/'
  const query = raw.indexOf('?')
  const path = query === -1 ? raw : raw.slice(0, query)
  return path.length > 0 ? path : '/'
}

function jsonError(error: string, message: string, status: number): HttpResult {
  return { status, body: { error, message } }
}

/** Scheme id for the buyer's origin network, defaulting to EVM. */
function schemeForBuyerFamily(buyerNetwork: Network): string {
  const family = familyForNetwork(normalizeNetwork(buyerNetwork))
  return (family && SCHEME_IDS[family]) || SCHEME_IDS.evm
}

function parseDiscoveryQuery(rawPath: string): ServiceQuery {
  const query: ServiceQuery = {}
  const question = rawPath.indexOf('?')
  if (question === -1) return query
  const params = new URLSearchParams(rawPath.slice(question + 1))
  const q = params.get('q')
  if (q) query.q = q
  const network = params.get('network')
  if (network) query.network = network
  const asset = params.get('asset')
  if (asset) query.asset = asset
  const category = params.get('category')
  if (category) query.category = category
  const maxPrice = params.get('maxPrice')
  if (maxPrice) query.maxPrice = maxPrice
  const owner = params.get('owner')
  if (owner) query.owner = owner
  const limit = Number(params.get('limit'))
  if (Number.isFinite(limit) && limit > 0) query.limit = limit
  const offset = Number(params.get('offset'))
  if (Number.isFinite(offset) && offset >= 0) query.offset = offset
  return query
}

export function createInteropFacilitator(
  options: CreateInteropFacilitatorOptions = {},
): InteropFacilitator {
  const intentsClient = options.intentsClient ?? createOneClickClient()
  const store = options.store ?? new FileStore()
  const statusTracker = options.statusTracker ?? new MemoryStatusTracker()
  const catalog = options.servicesCatalog ?? new MemoryServicesCatalog()
  catalog.load(store.listServices())
  const kinds = options.supportedKinds ?? supportedKinds
  const exactAdapters = options.exactAdapters ?? {}
  const rateLimiter = options.rateLimit ? new MemoryRateLimiter(options.rateLimit) : undefined
  const exposure = new MemoryExposureTracker(options.exposureLimits)
  function recordStatus(
    event: Parameters<MemoryStatusTracker['record']>[0],
    now: Date = new Date(),
  ) {
    const tracked = statusTracker.record(event, now)
    if (isTerminal(tracked.state)) exposure.release(event.quoteId)
    return tracked
  }

  function recordExactSettlement(
    requirements: Record<string, unknown>,
    outcome: { success?: boolean; transaction?: string } | undefined,
  ): void {
    if (requirements.scheme !== 'exact' || outcome?.success !== true) return
    const extra = (requirements.extra ?? {}) as Record<string, unknown>
    const quoteId = extra.quoteId
    if (typeof quoteId !== 'string') return
    recordStatus({
      quoteId,
      state: 'deposit_seen',
      ...(typeof outcome.transaction === 'string' ? { originTxHash: outcome.transaction } : {}),
      ...(extra.deliveryMode === 'on_success' || extra.deliveryMode === 'pending_push'
        ? { deliveryMode: extra.deliveryMode }
        : {}),
      ...(typeof extra.refundTo === 'string' ? { refundTo: extra.refundTo } : {}),
    })
  }
  function allKinds(): SupportedKind[] {
    const seen = new Set<string>()
    const combined: SupportedKind[] = []
    for (const kind of [
      ...kinds(),
      ...Object.values(exactAdapters).map((adapter) => ({
        x402Version: X402_VERSION,
        scheme: adapter.scheme,
        network: adapter.network,
        ...(adapter.extra ? { extra: adapter.extra } : {}),
      })),
    ]) {
      const key = `${kind.scheme}:${kind.network}`
      if (seen.has(key)) continue
      seen.add(key)
      combined.push(kind)
    }
    return combined
  }
  function exactSigners(): Record<string, string[]> {
    return Object.fromEntries(
      Object.values(exactAdapters).map((adapter) => [adapter.network, adapter.signers]),
    )
  }
  const walletChallenges = new WalletChallengeStore({
    domain: options.marketplaceDomain ?? 'localhost:4321',
    ...(options.now ? { now: options.now } : {}),
  })
  const marketplaceAuthenticator =
    options.marketplaceAuthenticator ??
    createMarketplaceAuthenticator({
      apiKeys: options.marketplaceApiKeys,
      walletSignatureVerifier: createWalletSignatureVerifier(walletChallenges),
    })
  const allowPrivateResourceUrls = options.allowPrivateResourceUrls === true
  const serviceHealthChecker =
    options.serviceHealthChecker ?? createDefaultServiceHealthChecker(allowPrivateResourceUrls)
  const marketplaceFees = options.marketplaceFees
  const marketplaceFreeListings =
    options.marketplaceFreeListings === true ||
    (marketplaceFees !== undefined &&
      marketplaceFees.registration.length > 0 &&
      marketplaceFees.registration.every((option) => option.amount === '0'))
  const persistence = options.persistence
  const listingPaymentProcessor =
    options.listingPaymentProcessor ??
    createUpstreamListingPaymentProcessor(async (payload, requirements) =>
      settlePayment(
        {
          x402Version: 2,
          paymentPayload: payload,
          paymentRequirements: requirements,
        },
        new Date(),
        { exact: exactAdapters },
      ),
    )

  const quoteToDeposit = new Map<string, { depositAddress: string; depositMemo?: string }>()
  const usedNonces = new Set<string>()
  const simulatedClient = isSimulatedOneClickClient(intentsClient) ? intentsClient : undefined

  function quoteIdForDeposit(depositAddress: string): string | undefined {
    for (const [quoteId, deposit] of quoteToDeposit) {
      if (deposit.depositAddress === depositAddress) return quoteId
    }
    return undefined
  }

  function bindingOf(paymentPayload: unknown): { nonce?: string } | undefined {
    const payload = paymentPayload as {
      payload?: { binding?: { nonce?: string } }
      binding?: { nonce?: string }
    }
    return payload?.payload?.binding ?? payload?.binding
  }

  async function issueQuote(
    parsed: QuoteRequest,
  ): Promise<
    | { ok: true; body: Record<string, unknown> }
    | { ok: false; message: string; status?: number; code?: string }
  > {
    const exact = exactAdapters[parsed.buyerNetwork]
    const scheme = exact ? 'exact' : schemeForBuyerFamily(parsed.buyerNetwork)
    exposure.sweep()
    const reservation = {
      quoteId: 'pending',
      buyer: parsed.buyerAddress,
      seller: parsed.sellerAddress,
      network: parsed.sellerNetwork,
      asset: parsed.sellerAsset,
      amount: BigInt(parsed.amount),
      deliveryMode: parsed.deliveryMode,
      expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
    }
    if (!exposure.check(reservation).allowed) {
      return {
        ok: false,
        message: 'Exposure limit exceeded for this buyer or seller',
      }
    }
    try {
      const quote = await mintQuote(
        parsed,
        intentsClient,
        options.slippageBps !== undefined ? { slippageBps: options.slippageBps } : {},
      )
      if (
        !exposure.reserve({
          ...reservation,
          quoteId: quote.quoteId,
          expiresAt: quote.expiresAt,
        })
      ) {
        return {
          ok: false,
          message: 'Exposure limit exceeded for this buyer or seller',
        }
      }
      quoteToDeposit.set(quote.quoteId, {
        depositAddress: quote.depositAddress,
        ...(quote.depositMemo ? { depositMemo: quote.depositMemo } : {}),
      })
      try {
        await store.saveQuote(quote.quoteId, quote)
        await store.saveDepositMapping(quote.quoteId, quote.depositAddress)
      } catch {
        /* store failures are non-fatal for a single transaction */
      }
      const prepared = quoteToRequirements(parsed, quote, scheme, exact?.extra)
      recordStatus({
        quoteId: quote.quoteId,
        state: 'pending_deposit',
        deliveryMode: parsed.deliveryMode,
        refundTo: parsed.buyerAddress,
      })
      return {
        ok: true,
        body: {
          ...prepared.requirements,
          quoteId: quote.quoteId,
          depositAddress: quote.depositAddress,
          extensions: prepared.extensions,
          schemeSummary: summaryForScheme(scheme),
        },
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to create a cross-chain quote',
      }
    }
  }

  async function readQuoteStatus(quoteId: string): Promise<HttpResult> {
    let tracked = statusTracker.get(quoteId)
    if (!tracked) return jsonError('not_found', 'Quote not found', 404)
    const deposit = quoteToDeposit.get(quoteId)
    if (deposit) {
      try {
        const status = deposit.depositMemo
          ? await intentsClient.status(deposit.depositAddress, deposit.depositMemo)
          : await intentsClient.status(deposit.depositAddress)
        const stateMap: Record<string, SwapState> = {
          PENDING_DEPOSIT: 'pending_deposit',
          KNOWN_DEPOSIT_TX: 'deposit_seen',
          PROCESSING: 'processing',
          SUCCESS: 'success',
          INCOMPLETE_DEPOSIT: 'refunded',
          REFUNDED: 'refunded',
          FAILED: 'failed',
        }
        const mapped = stateMap[status.status] ?? tracked.state
        if (mapped !== tracked.state) {
          tracked = recordStatus({
            quoteId,
            state: mapped,
            ...(status.originTxHash ? { originTxHash: status.originTxHash } : {}),
            ...(status.destinationTxHash ? { destinationTxHash: status.destinationTxHash } : {}),
          })
        }
      } catch {
        // Ignore; return tracked state.
      }
    }
    const deliveryMode = tracked.deliveryMode ?? 'on_deposit'
    const deliverable =
      deliveryMode === 'on_deposit'
        ? tracked.state === 'deposit_seen' ||
          tracked.state === 'processing' ||
          tracked.state === 'success'
        : tracked.state === 'success'
    return {
      status: 200,
      body: {
        ...tracked,
        deliveryMode,
        deliverable,
        ...(tracked.refundTo ? { refundTo: tracked.refundTo } : {}),
        ...(tracked.state === 'refunded'
          ? {
              refund: {
                status: 'refunded',
                ...(tracked.refundTo ? { to: tracked.refundTo } : {}),
                automatic: true,
              },
            }
          : {}),
      },
    }
  }

  const recordSimulatedDeposit = simulatedClient
    ? async (deposit: SimulatedDepositRecord): Promise<void> => {
        const quoteId = quoteIdForDeposit(deposit.depositAddress)
        if (!quoteId) return
        const ack = await simulatedClient.submitDeposit({
          depositAddress: deposit.depositAddress,
          txHash: deposit.txHash,
        })
        if (!ack.accepted) return
        simulatedClient.setStatus(deposit.depositAddress, 'SUCCESS')
        recordStatus({
          quoteId,
          state: 'success',
          originTxHash: deposit.txHash,
        })
      }
    : undefined

  const verificationOptions: InteropVerificationOptions = {
    interopStatus: {
      status: (depositAddress: string, depositMemo?: string) =>
        intentsClient.status(depositAddress, depositMemo),
    },
    store,
    ...(Object.keys(exactAdapters).length > 0 ? { exact: exactAdapters } : {}),
    ...(options.interopClients ? { interopClients: options.interopClients } : {}),
    ...(recordSimulatedDeposit ? { recordSimulatedDeposit } : {}),
  }

  async function rememberNonce(nonce: string | undefined, success: boolean): Promise<void> {
    if (!success || !nonce || usedNonces.has(nonce)) return
    usedNonces.add(nonce)
    try {
      await store.addNonce(nonce)
    } catch {
      /* non-fatal */
    }
  }

  async function searchServices(args: SearchServicesArgs): Promise<McpHandlerOutcome> {
    const page = catalog.search({
      ...(args.query ? { q: args.query } : {}),
      ...(args.network ? { network: args.network } : {}),
      ...(args.asset ? { asset: args.asset } : {}),
      ...(args.category ? { category: args.category } : {}),
      ...(args.maxPrice ? { maxPrice: args.maxPrice } : {}),
      ...(args.owner ? { owner: args.owner } : {}),
      ...(args.limit ? { limit: args.limit } : {}),
      ...(args.offset ? { offset: args.offset } : {}),
    })
    return { isError: false, data: page }
  }

  async function preparePayment(args: PreparePaymentArgs): Promise<McpHandlerOutcome> {
    const service = catalog.get(args.serviceId)
    if (!service) return { isError: true, error: 'not_found', message: 'Service not found' }
    const sellerNetwork = args.sellerNetwork ?? service.networks[0]
    if (!sellerNetwork) {
      return { isError: true, error: 'invalid_service', message: 'Service has no seller network' }
    }
    // Settlement pays the listing's payTo, never its owner id. An owner is a
    // CAIP-10 identity and would be an invalid recipient on the seller chain.
    if (!service.payTo) {
      return {
        isError: true,
        error: 'invalid_service',
        message: 'This listing has no payTo address and cannot be paid yet',
      }
    }
    const payToProblem = payToNetworkError([sellerNetwork], service.payTo)
    if (payToProblem) {
      return { isError: true, error: 'invalid_service', message: payToProblem }
    }
    const amount = args.amount ?? (/^\d+$/.test(service.price) ? service.price : undefined)
    if (!amount) {
      return {
        isError: true,
        error: 'amount_required',
        message: 'Pass amount as an atomic integer. The listing price is not atomic.',
      }
    }
    let parsed: QuoteRequest
    try {
      parsed = parseQuoteRequest({
        sellerNetwork,
        sellerAsset: service.asset,
        sellerAddress: service.payTo,
        amount,
        buyerNetwork: args.buyerNetwork,
        buyerAsset: args.buyerAsset,
        ...(args.buyerAssetId ? { buyerAssetId: args.buyerAssetId } : {}),
        buyerAddress: args.buyerAddress,
        deliveryMode: 'on_deposit',
      })
    } catch (error) {
      return {
        isError: true,
        error: 'invalid_arguments',
        message: error instanceof Error ? error.message : 'Invalid quote request',
      }
    }
    const issued = await issueQuote(parsed)
    if (!issued.ok) {
      return { isError: true, error: issued.code ?? 'quote_unavailable', message: issued.message }
    }
    return {
      isError: false,
      data: { serviceId: service.id, resourceUrl: service.resourceUrl, ...issued.body },
    }
  }

  async function payAndFetch(args: PayAndFetchArgs): Promise<McpHandlerOutcome> {
    const request = {
      x402Version: 2,
      paymentPayload: args.paymentPayload,
      paymentRequirements: args.paymentRequirements,
    }
    const parsed = facilitatorRequestSchema.safeParse(request)
    if (!parsed.success) {
      return {
        isError: true,
        error: 'invalid_arguments',
        message: 'paymentPayload and paymentRequirements are not a facilitator request',
      }
    }
    const nonce = bindingOf(parsed.data.paymentPayload)?.nonce
    if (nonce && (usedNonces.has(nonce) || (await store.hasNonce(nonce)))) {
      return { isError: true, error: 'nonce_reused', message: 'Nonce has been used' }
    }
    const verified = await verifyPayment(
      parsed.data as unknown as VerifyRequest,
      new Date(),
      verificationOptions,
    )
    if (!verified.isValid) {
      return {
        isError: false,
        data: { status: 'payment_rejected', verification: verified },
      }
    }
    const settled = await settlePayment(
      parsed.data as unknown as SettleRequest,
      new Date(),
      verificationOptions,
    )
    if (!settled.success) {
      return { isError: false, data: { status: 'settlement_failed', settlement: settled } }
    }
    recordExactSettlement(
      parsed.data.paymentRequirements as unknown as Record<string, unknown>,
      settled,
    )
    await rememberNonce(nonce, true)
    const service = args.serviceId ? catalog.get(args.serviceId) : undefined
    const resourceUrl = args.resourceUrl ?? service?.resourceUrl
    if (!resourceUrl) {
      return {
        isError: false,
        data: { status: 'settled', settlement: settled, resource: { error: 'no_resource_url' } },
      }
    }
    try {
      assertFetchTarget(resourceUrl, allowPrivateResourceUrls)
      const response = await fetch(resourceUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      })
      const text = (await response.text()).slice(0, 64_000)
      return {
        isError: false,
        data: {
          status: 'success',
          settlement: settled,
          resource: { status: response.status, body: text },
        },
      }
    } catch (error) {
      return {
        isError: false,
        data: {
          status: 'settled',
          settlement: settled,
          resource: { error: error instanceof Error ? error.message : 'Resource fetch failed' },
        },
      }
    }
  }

  const mcpHandlers: McpToolHandlers = {
    search_services: searchServices,
    async get_service(args) {
      const service = catalog.get(args.serviceId)
      if (!service) return { isError: true, error: 'not_found', message: 'Service not found' }
      return { isError: false, data: service }
    },
    prepare_payment: preparePayment,
    pay_and_fetch: payAndFetch,
    async payment_status(args) {
      const result = await readQuoteStatus(args.quoteId)
      if (result.status !== 200) {
        const body = result.body as { error?: string; message?: string }
        return {
          isError: true,
          error: body.error ?? 'not_found',
          message: body.message ?? 'Quote not found',
        }
      }
      return { isError: false, data: result.body }
    },
    async get_credit(args) {
      return {
        isError: false,
        data: {
          account: args.account,
          spendable: '0',
          pending: '0',
          custody: 'none',
        },
      }
    },
  }

  async function routeFacilitator(
    method: string,
    rawPath: string,
    body: unknown,
    headers: Record<string, string | undefined> = {},
  ): Promise<HttpResult> {
    const question = rawPath.indexOf('?')
    const path = question === -1 ? rawPath : rawPath.slice(0, question)

    if (
      rateLimiter &&
      (path === '/interop/quote' ||
        path === '/verify' ||
        path === '/settle' ||
        path === '/auth/challenge')
    ) {
      rateLimiter.sweep()
      const ip =
        headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || 'anonymous'
      const auth = headers.authorization
        ? createHash('sha256').update(headers.authorization).digest('hex').slice(0, 16)
        : ''
      const decision = rateLimiter.take(`${ip}:${auth}`)
      if (!decision.allowed) {
        return {
          status: 429,
          body: {
            error: 'rate_limited',
            message: 'Too many requests; retry after the window resets',
            retryAfterSeconds: decision.retryAfterSeconds,
          },
        }
      }
    }

    if (method === 'GET' && path === '/health') {
      return { status: 200, body: { status: 'ok', service: 'facilitator' } }
    }
    if (
      method === 'GET' &&
      (path === '/mcp' || path === '/mcp/tools' || path === '/.well-known/mcp')
    ) {
      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          result: { tools: listTools() },
          serverInfo: { name: 'x402interop-facilitator-mcp', version: '1.0.0' },
        },
      }
    }
    if (method === 'POST' && (path === '/mcp' || path === '/mcp/rpc')) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? null)
      return handleMcpRequest(bodyStr, mcpHandlers)
    }
    if (method === 'GET' && path === '/supported') {
      return { status: 200, body: supportedResponse(allKinds(), exactSigners()) }
    }
    if (method === 'POST' && path === '/auth/challenge') {
      const input = (body ?? {}) as Record<string, unknown>
      if (!isWalletFamily(input.family)) {
        return jsonError('invalid_request', 'family must be evm, sui, solana, or near', 400)
      }
      if (
        typeof input.address !== 'string' ||
        typeof input.method !== 'string' ||
        typeof input.path !== 'string' ||
        typeof input.bodyHash !== 'string'
      ) {
        return jsonError('invalid_request', 'address, method, path, and bodyHash are required', 400)
      }
      try {
        const issued = walletChallenges.issue({
          family: input.family,
          address: input.address,
          ...(typeof input.chainId === 'string' && input.chainId !== ''
            ? { chainId: input.chainId }
            : {}),
          method: input.method.toUpperCase(),
          path: input.path,
          bodyHash: input.bodyHash,
        })
        return { status: 200, body: issued }
      } catch (error) {
        return jsonError(
          'invalid_request',
          error instanceof Error ? error.message : 'Invalid challenge request',
          400,
        )
      }
    }
    if (method === 'GET' && path === '/marketplace/fees') {
      if (marketplaceFreeListings) {
        return {
          status: 200,
          body: {
            free: true,
            registration: [],
            featured: { '30d': [], '60d': [] },
          },
        }
      }
      if (!marketplaceFees)
        return jsonError('fees_unavailable', 'Marketplace fees are not configured', 503)
      return { status: 200, body: marketplaceFees }
    }

    // Marketplace discovery endpoints (mirrors the Bazaar surface).
    if (
      method === 'GET' &&
      (path === '/discovery/resources' || path.startsWith('/discovery/resources/'))
    ) {
      const id = decodeURIComponent(path.slice('/discovery/resources'.length)).replace(/^\/+/, '')
      if (id === '') {
        const page = catalog.search(parseDiscoveryQuery(rawPath))
        return {
          status: 200,
          body: {
            resources: page.items,
            total: page.total,
            limit: page.limit,
            offset: page.offset,
          },
        }
      }
      const resource = catalog.get(id)
      if (!resource) return jsonError('not_found', 'Resource not found', 404)
      return { status: 200, body: { resource } }
    }
    if (method === 'GET' && path === '/discovery/merchants') {
      return { status: 200, body: { merchants: catalog.merchants() } }
    }
    if (method === 'POST' && path === '/discovery/resources') {
      const principal = await marketplaceAuthenticator.authenticate({ method, path, body, headers })
      if (!principal) {
        return jsonError(
          'authentication_required',
          'Registration requires a valid API key or wallet signature',
          401,
        )
      }
      let record: ReturnType<typeof parseServiceRecord>
      let fee: ListingFeeOption | undefined
      let payment: { success: true; transaction: string } | undefined
      try {
        const input = body as Record<string, unknown>
        const paymentNetwork = typeof input?.paymentNetwork === 'string' ? input.paymentNetwork : ''
        const paymentAsset = typeof input?.paymentAsset === 'string' ? input.paymentAsset : ''
        const shaped = {
          ...input,
          owner:
            typeof input?.owner === 'string' && input.owner !== '' ? input.owner : principal.owner,
          id:
            typeof input?.id === 'string' && input.id !== ''
              ? input.id
              : slugify(String(input?.name ?? '')),
        }
        record = parseServiceRecord(shaped)
        if (record.owner !== principal.owner) {
          return jsonError(
            'owner_mismatch',
            'Authenticated owner does not match resource owner',
            403,
          )
        }
        // `payTo` is the payout destination and must be valid on every network
        // the listing settles on. Never fall back to the owner: an owner id is a
        // CAIP-10 identity, not an address, and may belong to another chain.
        if (record.payTo !== undefined) {
          const payToProblem = payToNetworkError(record.networks, record.payTo)
          if (payToProblem) {
            return jsonError('invalid_pay_to', payToProblem, 400)
          }
        }
        const existing = catalog.get(record.id)
        if (existing) return jsonError('conflict', 'A resource with this id is already listed', 409)
        if (!marketplaceFreeListings) {
          if (!marketplaceFees)
            return jsonError('fees_unavailable', 'Marketplace fees are not configured', 503)
          fee = marketplaceFees.registration.find(
            (option) => option.network === paymentNetwork && option.asset === paymentAsset,
          ) as ListingFeeOption
          if (!fee)
            return jsonError(
              'unsupported_fee_asset',
              'Choose a configured payment network and asset',
              400,
            )
        }
      } catch (error) {
        return jsonError(
          'invalid_service',
          error instanceof Error ? error.message : 'Invalid service record',
          400,
        )
      }
      if (!marketplaceFreeListings && fee) {
        const signature = headers['payment-signature'] ?? headers['PAYMENT-SIGNATURE']
        if (!signature) {
          return {
            status: 402,
            body: {
              x402Version: 2,
              resource: '/discovery/resources',
              accepts: [{ ...fee, scheme: 'exact', payTo: fee.treasury, maxTimeoutSeconds: 300 }],
              error: 'payment_required',
              message: 'A registration fee payment is required before publishing this listing',
            },
          }
        }
        if (!listingPaymentProcessor) {
          return jsonError(
            'payment_unavailable',
            'Listing payment processing is not configured',
            503,
          )
        }
        const result = await listingPaymentProcessor.settle({
          paymentSignature: signature,
          paymentRequirements: fee,
          resource: '/discovery/resources',
          metadata: record,
        })
        if (!result.success) return jsonError('payment_rejected', result.reason, 402)
        payment = result
      }
      if (persistence) {
        try {
          if (payment && fee) {
            const paymentId = randomUUID()
            await persistence.recordListingPayment({
              paymentId,
              resourceId: record.id,
              owner: principal.owner,
              kind: 'registration',
              network: fee.network,
              asset: fee.asset,
              amount: fee.amount,
              treasury: fee.treasury,
              transactionId: payment.transaction,
              idempotencyKey: `registration:${principal.owner}:${record.id}`,
              status: 'settled',
            })
            await persistence.recordAuditEvent({
              eventId: randomUUID(),
              actor: principal.owner,
              action: 'listing_registered',
              resourceId: record.id,
              paymentId,
              metadata: {
                transaction: payment.transaction,
                network: fee.network,
                asset: fee.asset,
                amount: fee.amount,
              },
            })
          } else {
            await persistence.recordAuditEvent({
              eventId: randomUUID(),
              actor: principal.owner,
              action: 'listing_registered',
              resourceId: record.id,
              metadata: { free: true },
            })
          }
        } catch {
          /* a settled payment must not be lost because the ledger write failed */
        }
      }
      catalog.register(record)
      try {
        await store.saveServices(catalog.snapshot())
      } catch {
        /* persistence failures do not block listing */
      }
      return {
        status: 201,
        body: {
          ok: true,
          resource: record,
          ...(payment ? { transaction: payment.transaction } : { free: true }),
        },
      }
    }
    if (
      path.startsWith('/discovery/resources/') &&
      (method === 'PUT' ||
        method === 'PATCH' ||
        method === 'DELETE' ||
        (method === 'POST' && path.endsWith('/health')))
    ) {
      const suffix = path.slice('/discovery/resources/'.length)
      if (suffix.endsWith('/health')) {
        if (method !== 'POST') return jsonError('method_not_allowed', 'Use POST', 405)
        const id = decodeURIComponent(suffix.slice(0, -'/health'.length))
        const existing = catalog.get(id)
        if (!existing) return jsonError('not_found', 'Resource not found', 404)
        const principal = await marketplaceAuthenticator.authenticate({
          method,
          path,
          body,
          headers,
        })
        if (!principal)
          return jsonError('authentication_required', 'Sign in to run health checks', 401)
        if (principal.owner !== existing.owner) {
          return jsonError('forbidden', 'Only the resource owner can run health checks', 403)
        }
        const health = await serviceHealthChecker(existing)
        const updated = catalog.update(id, {
          ...existing,
          health: health.health,
          healthMessage: health.message,
          healthCheckedAt: new Date().toISOString(),
        })
        if (!updated) return jsonError('not_found', 'Resource not found', 404)
        await store.saveServices(catalog.snapshot())
        return { status: 200, body: { ok: true, resource: updated } }
      }
      const id = decodeURIComponent(suffix)
      const existing = catalog.get(id)
      if (!existing) return jsonError('not_found', 'Resource not found', 404)
      const principal = await marketplaceAuthenticator.authenticate({ method, path, body, headers })
      if (!principal)
        return jsonError('authentication_required', 'Sign in to manage this resource', 401)
      if (principal.owner !== existing.owner) {
        return jsonError('forbidden', 'Only the resource owner can manage this resource', 403)
      }
      if (method === 'DELETE') {
        catalog.remove(id)
        await store.saveServices(catalog.snapshot())
        return { status: 200, body: { ok: true, id } }
      }
      try {
        const input = body as Record<string, unknown>
        const record = parseServiceRecord({
          ...existing,
          ...input,
          id,
          owner: existing.owner,
          health: existing.health,
        })
        const updated = catalog.update(id, record)
        if (!updated) return jsonError('not_found', 'Resource not found', 404)
        await store.saveServices(catalog.snapshot())
        return { status: 200, body: { ok: true, resource: updated } }
      } catch (error) {
        return jsonError(
          'invalid_service',
          error instanceof Error ? error.message : 'Invalid service record',
          400,
        )
      }
    }

    if (method === 'POST' && path === '/interop/quote') {
      let parsed: QuoteRequest
      try {
        parsed = parseQuoteRequest(body)
      } catch (error) {
        return jsonError(
          'invalid_request',
          error instanceof Error ? error.message : 'Invalid quote request',
          400,
        )
      }
      const issued = await issueQuote(parsed)
      if (!issued.ok) {
        return jsonError(issued.code ?? 'quote_unavailable', issued.message, issued.status ?? 502)
      }
      return { status: 200, body: issued.body }
    }
    if (simulatedClient && path === '/interop/simulate/deposit') {
      if (method !== 'POST') return jsonError('method_not_allowed', 'Use POST', 405)
      const input = body as { quoteId?: unknown; txHash?: unknown }
      const quoteId = typeof input?.quoteId === 'string' ? input.quoteId : ''
      const txHash = typeof input?.txHash === 'string' ? input.txHash : ''
      if (!quoteId || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        return jsonError('invalid_request', 'quoteId and a 32-byte txHash are required', 400)
      }
      const deposit = quoteToDeposit.get(quoteId)
      if (!deposit) return jsonError('not_found', 'Quote not found', 404)
      const ack = await simulatedClient.submitDeposit({
        depositAddress: deposit.depositAddress,
        txHash,
      })
      if (!ack.accepted) {
        return jsonError('deposit_rejected', 'The simulator rejected the deposit', 409)
      }
      simulatedClient.setStatus(deposit.depositAddress, 'SUCCESS')
      const tracked = recordStatus({ quoteId, state: 'success', originTxHash: txHash })
      return {
        status: 200,
        body: {
          accepted: true,
          quoteId,
          depositAddress: deposit.depositAddress,
          txHash,
          status: tracked,
        },
      }
    }
    if (method === 'GET' && path.startsWith('/interop/status/')) {
      return readQuoteStatus(path.slice('/interop/status/'.length))
    }
    if (path === '/verify' || path === '/settle') {
      if (method !== 'POST') return jsonError('method_not_allowed', 'Use POST', 405)
      const parsed = facilitatorRequestSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError('invalid_request', 'Body does not match the facilitator request', 400)
      }
      const binding = bindingOf(parsed.data.paymentPayload)
      if (
        binding?.nonce &&
        (usedNonces.has(binding.nonce) || (await store.hasNonce(binding.nonce)))
      ) {
        return {
          status: 200,
          body: {
            isValid: false,
            invalidReason: 'nonce_reused',
            invalidMessage: 'Nonce has been used',
          },
        }
      }
      const outcome =
        path === '/verify'
          ? await verifyPayment(
              parsed.data as unknown as VerifyRequest,
              new Date(),
              verificationOptions,
            )
          : await settlePayment(
              parsed.data as unknown as SettleRequest,
              new Date(),
              verificationOptions,
            )
      await rememberNonce(
        binding?.nonce,
        path === '/settle' && (outcome as { success?: boolean }).success === true,
      )
      if (path === '/settle') {
        recordExactSettlement(
          parsed.data.paymentRequirements as unknown as Record<string, unknown>,
          outcome as { success?: boolean; transaction?: string },
        )
      }
      return { status: 200, body: outcome }
    }
    return jsonError('not_found', 'No such route', 404)
  }

  async function handleMcpBody(body: string): Promise<HttpResult> {
    return handleMcpRequest(body, mcpHandlers)
  }

  return {
    routeFacilitator,
    supportedKinds: allKinds,
    listTools,
    handleMcpRequest: handleMcpBody,
  }
}

export { supportedKinds }

/** Standalone MCP request handler (parse → handle → result). */
export async function handleMcpRequest(
  body: string,
  handlers?: McpToolHandlers,
): Promise<HttpResult> {
  try {
    const message = JSON.parse(body)
    const response = await handleMcp(message, handlers)
    return { status: 200, body: response }
  } catch {
    return {
      status: 400,
      body: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    }
  }
}

export { listTools, handleMcp } from './mcp.js'
