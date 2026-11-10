// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Thin HTTP shell over `@x402interop/facilkit`. All routing, verification,
 * settlement, quoting, status, and MCP logic lives in facilkit; this file only
 * turns the facilitator into a Node HTTP server.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import {
  createInteropFacilitator,
  FileStore,
  PostgresFacilitatorStore,
  readFacilitatorEnvironment,
  methodOf,
  createPostgresPersistenceBackend,
  createPostgresPool,
  defaultMigrationsDirectory,
  runPostgresMigrations,
  type FacilitatorStore,
  type HttpResult,
  type InteropFacilitator,
  type PersistenceBackend,
} from '@x402interop/facilkit'
import type { ExactAdapter } from '@x402interop/adpt'

import { readExactAdapters } from './exact.js'
import { readExposureLimits, readRateLimit } from './limits.js'
import { readMarketplaceEnvironment } from './marketplace.js'

const environment = readFacilitatorEnvironment()
const marketplace = readMarketplaceEnvironment()
const rateLimit = readRateLimit()
const exposureLimits = readExposureLimits()

function createFacilitator(
  store: FacilitatorStore,
  persistence?: PersistenceBackend,
  exactAdapters?: Record<string, ExactAdapter>,
): InteropFacilitator {
  return createInteropFacilitator({
    store,
    marketplaceFees: marketplace.fees,
    marketplaceFreeListings: marketplace.freeListings,
    marketplaceApiKeys: marketplace.apiKeys,
    marketplaceDomain: marketplace.domain,
    ...(persistence ? { persistence } : {}),
    ...(exactAdapters && Object.keys(exactAdapters).length > 0 ? { exactAdapters } : {}),
    ...(rateLimit ? { rateLimit } : {}),
    ...(exposureLimits ? { exposureLimits } : {}),
    slippageBps: environment.slippageBps,
  })
}

let defaultFacilitator: InteropFacilitator | undefined

function defaultFacilitatorInstance(): InteropFacilitator {
  defaultFacilitator ??= createFacilitator(
    new FileStore(environment.storePath, { strict: process.env.NODE_ENV === 'production' }),
  )
  return defaultFacilitator
}

export function routeFacilitator(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string | undefined> = {},
): Promise<HttpResult> {
  return defaultFacilitatorInstance().routeFacilitator(method, path, body, headers)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(payload)
}

/**
 * Local marketplace and docs origins, for development only. Production sets
 * FACILITATOR_CORS_ORIGINS; unset in production means no cross-origin access.
 */
const LOCAL_CORS_ORIGINS = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:4322',
  'http://127.0.0.1:4322',
]

/**
 * Browser apps call the facilitator from another port. An unset allow-list
 * keeps the local marketplace working; an empty list turns CORS off.
 */
export function allowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  const configured = env.FACILITATOR_CORS_ORIGINS
  const fallback = env.NODE_ENV === 'production' ? '' : LOCAL_CORS_ORIGINS.join(',')
  const raw = configured === undefined ? fallback : configured
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || !allowedCorsOrigins().has(origin)) return
  res.setHeader('access-control-allow-origin', origin)
  res.setHeader('vary', 'origin')
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader(
    'access-control-allow-headers',
    'content-type, authorization, x-x402interop-api-key, x-x402interop-signature, payment-signature',
  )
}

async function dispatchWith(
  facilitator: InteropFacilitator,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  applyCors(req, res)
  if ((req.method ?? 'GET').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  const raw = await readBody(req)
  if (raw !== '') {
    try {
      const body: unknown = JSON.parse(raw)
      const result = await facilitator.routeFacilitator(
        methodOf(req.method),
        req.url ?? '/',
        body,
        Object.fromEntries(
          Object.entries(req.headers).map(([key, value]) => [
            key,
            Array.isArray(value) ? value[0] : value,
          ]),
        ),
      )
      sendJson(res, result.status, result.body)
      return
    } catch {
      sendJson(res, 400, { error: 'invalid_json', message: 'Request body is not valid JSON' })
      return
    }
  }
  const result = await facilitator.routeFacilitator(
    methodOf(req.method),
    req.url ?? '/',
    undefined,
    Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    ),
  )
  sendJson(res, result.status, result.body)
}

export function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return dispatchWith(defaultFacilitatorInstance(), req, res)
}

export function createFacilitatorServer(
  facilitator: InteropFacilitator = defaultFacilitatorInstance(),
): Server {
  return createServer((req, res) => {
    void dispatchWith(facilitator, req, res)
  })
}

export async function createFacilitatorServerWithPersistence(): Promise<{
  server: Server
  store: PostgresFacilitatorStore
  persistence: ReturnType<typeof createPostgresPersistenceBackend>
  close: () => Promise<void>
}> {
  /* v8 ignore start -- live PostgreSQL startup is covered by migration/backend tests */
  if (environment.storageMode !== 'postgres' || !environment.databaseUrl) {
    throw new Error('PostgreSQL facilitator runtime requires DATABASE_URL')
  }
  const pool = await createPostgresPool(environment.databaseUrl)
  const persistence = createPostgresPersistenceBackend(pool)
  try {
    await runPostgresMigrations(pool, await defaultMigrationsDirectory())
    const store = await PostgresFacilitatorStore.create(pool)
    const exactAdapters = await readExactAdapters()
    const facilitator = createFacilitator(store, persistence, exactAdapters)
    return {
      server: createFacilitatorServer(facilitator),
      store,
      persistence,
      close: () => pool.end(),
    }
  } catch (error) {
    await pool.end()
    throw new Error(
      `Facilitator PostgreSQL startup failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  /* v8 ignore stop */
}
