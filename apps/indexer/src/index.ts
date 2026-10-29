// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const services: any[] = []
const receipts: any[] = []
const corridors: any[] = []

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

export function createIndexerServer() {
  return createServer((req, res) => {
    const method = methodOf(req.method)
    const url = req.url || '/'
    const path = requestPath(url)
    
    // Discovery routes
    if (method === 'GET' && path.startsWith('/services')) {
      const params = new URL(url, 'http://localhost').searchParams
      const query = params.get('q')?.toLowerCase()
      let results = services
      if (query) {
        results = services.filter(
          (s) =>
            s.name?.toLowerCase().includes(query) ||
            s.description?.toLowerCase().includes(query),
        )
      }
      return json(res, 200, { services: results })
    }
    if (method === 'POST' && path === '/register') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          services.push({ ...data, registeredAt: new Date().toISOString() })
          json(res, 201, { ok: true })
        } catch {
          json(res, 400, { error: 'invalid_json' })
        }
      })
      return
    }
    
    // Explorer routes
    if (method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok', service: 'indexer' })
    }
    if (method === 'GET' && path === '/') {
      return json(res, 200, {
        name: 'x402interop indexer',
        status: 'ok',
        services: services.length,
        receipts: receipts.length,
        corridors: corridors.length,
      })
    }
    if (method === 'GET' && path === '/receipts') {
      return json(res, 200, { receipts })
    }
    if (method === 'GET' && path === '/corridors') {
      return json(res, 200, { corridors })
    }
    if (method === 'POST' && path === '/receipts') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          receipts.push({ ...data, indexedAt: new Date().toISOString() })
          json(res, 201, { ok: true })
        } catch {
          json(res, 400, { error: 'invalid_json' })
        }
      })
      return
    }
    
    json(res, 404, { error: 'not_found' })
  })
}

export const createDiscoveryServer = createIndexerServer
export const createExplorerServer = createIndexerServer
