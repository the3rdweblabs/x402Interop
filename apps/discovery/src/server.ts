// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const services: any[] = []
const receipts: any[] = []
const corridors: Map<string, any> = new Map()

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function methodOf(method: string | undefined): string {
  return method ?? 'GET'
}

function requestPath(url: string | undefined): string {
  const raw = url && url.length > 0 ? url : '/'
  const query = raw.indexOf('?')
  const path = query === -1 ? raw : raw.slice(0, query)
  return path.length > 0 ? path : '/'
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

export function createDiscoveryServer() {
  return createServer(async (req, res) => {
    const method = methodOf(req.method)
    const url = req.url || '/'
    const path = requestPath(url)

    // Discovery routes
    if (method === 'GET' && path.startsWith('/services')) {
      const params = new URL(url, 'http://localhost').searchParams
      const query = params.get('q')?.toLowerCase()
      const network = params.get('network')
      let results = services
      if (query) {
        results = results.filter(
          (s) =>
            s.name?.toLowerCase().includes(query) ||
            s.description?.toLowerCase().includes(query) ||
            s.tags?.some((t: string) => t.toLowerCase().includes(query)),
        )
      }
      if (network) {
        results = results.filter((s) => s.network === network || s.networks?.includes(network))
      }
      return json(res, 200, { services: results, count: results.length })
    }

    if (method === 'POST' && (path === '/register' || path === '/services')) {
      const body = await readBody(req)
      try {
        const data = JSON.parse(body)
        const service = {
          ...data,
          id: data.id || `svc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          registeredAt: new Date().toISOString(),
        }
        services.push(service)
        json(res, 201, { ok: true, service })
      } catch {
        json(res, 400, { error: 'invalid_json' })
      }
      return
    }

    if (method === 'GET' && path === '/search') {
      const params = new URL(url, 'http://localhost').searchParams
      const q = params.get('q')?.toLowerCase() || ''
      const results = services.filter(
        (s) =>
          !q ||
          s.name?.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q),
      )
      return json(res, 200, { results })
    }

    // Explorer routes
    if (method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok', service: 'discovery', services: services.length, receipts: receipts.length })
    }

    if (method === 'GET' && path === '/') {
      return json(res, 200, {
        name: 'x402interop discovery',
        version: '0.0.0',
        description: 'Unified discovery and explorer for x402interop services',
        status: 'ok',
        services: services.length,
        receipts: receipts.length,
        corridors: corridors.size,
        endpoints: [
          'GET /services',
          'POST /register',
          'GET /search',
          'GET /receipts',
          'GET /corridors',
          'POST /receipts',
          'GET /corridors/:id',
        ],
      })
    }

    if (method === 'GET' && path === '/receipts') {
      const params = new URL(url, 'http://localhost').searchParams
      const network = params.get('network')
      const scheme = params.get('scheme')
      let results = receipts
      if (network) results = results.filter((r) => r.network === network)
      if (scheme) results = results.filter((r) => r.scheme === scheme)
      return json(res, 200, { receipts: results.slice(-100), count: results.length })
    }

    if (method === 'POST' && path === '/receipts') {
      const body = await readBody(req)
      try {
        const data = JSON.parse(body)
        const receipt = {
          ...data,
          id: data.id || `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          indexedAt: new Date().toISOString(),
        }
        receipts.push(receipt)
        // Update corridor
        const corridorKey = `${receipt.originNetwork || receipt.buyerNetwork}->${receipt.network || receipt.settlementNetwork}`
        const existing = corridors.get(corridorKey) || { corridor: corridorKey, count: 0, volume: '0', receipts: [] }
        existing.count++
        existing.receipts.push(receipt.id)
        existing.lastSeen = receipt.indexedAt
        corridors.set(corridorKey, existing)
        json(res, 201, { ok: true, receipt })
      } catch {
        json(res, 400, { error: 'invalid_json' })
      }
      return
    }

    if (method === 'GET' && path === '/corridors') {
      return json(res, 200, { corridors: Array.from(corridors.values()) })
    }

    if (method === 'GET' && path.startsWith('/corridors/')) {
      const id = path.split('/')[2]
      const corridor = corridors.get(decodeURIComponent(id))
      if (!corridor) return json(res, 404, { error: 'not_found' })
      return json(res, 200, { corridor, receipts: receipts.filter((r) => corridor.receipts.includes(r.id)) })
    }

    if (method === 'GET' && path === '/stats') {
      return json(res, 200, {
        services: services.length,
        receipts: receipts.length,
        corridors: corridors.size,
        schemes: [...new Set(services.flatMap((s) => s.schemes || []))],
        networks: [...new Set(services.map((s) => s.network).filter(Boolean))],
      })
    }

    json(res, 404, { error: 'not_found', message: 'No such route' })
  })
}

export const createExplorerServer = createDiscoveryServer
export { createDiscoveryServer as createServer }
export { methodOf, requestPath }
export function routeDiscovery(method: string, path: string) {
  if (method === 'GET' && path === '/health') return { status: 200, body: { status: 'ok' } }
  if (method === 'GET' && path.startsWith('/services')) return { status: 200, body: { services } }
  return { status: 404, body: { error: 'not_found' } }
}
export function routeExplorer(method: string, path: string) {
  return routeDiscovery(method, path)
}
export function searchQuery(url: string | undefined) {
  const params = new URL(url || '', 'http://localhost').searchParams
  return params.get('q') || ''
}
export function urlOf(path: string) {
  return path
}
export function dispatch(req: IncomingMessage, res: ServerResponse) {
  return createDiscoveryServer()(req, res)
}

export default createDiscoveryServer
