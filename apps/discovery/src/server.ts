// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import {
  MemoryDiscoveryIndex,
  serviceRecordSchema,
  type SearchQuery,
  type ServiceRecord,
} from '@x402interop/discovery'

export interface HttpResult {
  status: number
  body: unknown
}

export function methodOf(method: string | undefined): string {
  return method ?? 'GET'
}

export function urlOf(url: string | undefined): string {
  return url ?? '/'
}

export function requestPath(url: string | undefined): string {
  const raw = url && url.length > 0 ? url : '/'
  const query = raw.indexOf('?')
  const path = query === -1 ? raw : raw.slice(0, query)
  return path.length > 0 ? path : '/'
}

export function searchQuery(url: string): SearchQuery {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  const params = new URLSearchParams(query)
  const limitRaw = params.get('limit')
  const limit = limitRaw === null ? undefined : Number(limitRaw)
  const read = (key: string): string | undefined => {
    const value = params.get(key)
    return value === null ? undefined : value
  }
  return {
    q: read('q'),
    network: read('network'),
    asset: read('asset'),
    maxPrice: read('maxPrice'),
    category: read('category'),
    limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
  }
}

export function routeDiscovery(
  method: string,
  url: string,
  body: unknown,
  index: MemoryDiscoveryIndex,
): HttpResult {
  const path = requestPath(url)
  if (method === 'GET' && path === '/health') {
    return { status: 200, body: { status: 'ok', service: 'discovery' } }
  }
  if (method === 'GET' && path === '/interop/discovery/search') {
    return { status: 200, body: { services: index.search(searchQuery(url)) } }
  }
  if (method === 'GET' && path.startsWith('/interop/discovery/')) {
    const id = decodeURIComponent(path.slice('/interop/discovery/'.length))
    const service = index.get(id)
    if (!service) return { status: 404, body: { error: 'not_found', message: 'Unknown service' } }
    return { status: 200, body: service }
  }
  if (method === 'POST' && path === '/interop/discovery/register') {
    const parsed = serviceRecordSchema.safeParse(body)
    if (!parsed.success) {
      return {
        status: 400,
        body: { error: 'invalid_request', message: 'Service registration is incomplete' },
      }
    }
    index.register(parsed.data)
    return { status: 201, body: parsed.data }
  }
  return { status: 404, body: { error: 'not_found', message: 'No such route' } }
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
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  index: MemoryDiscoveryIndex,
): Promise<void> {
  const raw = await readBody(req)
  if (raw !== '') {
    try {
      const body: unknown = JSON.parse(raw)
      const result = routeDiscovery(methodOf(req.method), urlOf(req.url), body, index)
      sendJson(res, result.status, result.body)
      return
    } catch {
      sendJson(res, 400, { error: 'invalid_json', message: 'Request body is not valid JSON' })
      return
    }
  }
  const result = routeDiscovery(methodOf(req.method), urlOf(req.url), undefined, index)
  sendJson(res, result.status, result.body)
}

export function createDiscoveryServer(
  index: MemoryDiscoveryIndex = new MemoryDiscoveryIndex(),
): Server {
  return createServer((req, res) => {
    void dispatch(req, res, index)
  })
}

export type { ServiceRecord }
