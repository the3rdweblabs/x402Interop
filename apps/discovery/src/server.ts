// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const services: any[] = []

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function createDiscoveryServer() {
  return createServer((req, res) => {
    const url = req.url || '/'
    if (req.method === 'GET' && url.startsWith('/services')) {
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
    if (req.method === 'POST' && url === '/register') {
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
    if (req.method === 'GET' && url === '/health') {
      return json(res, 200, { status: 'ok', service: 'discovery' })
    }
    json(res, 404, { error: 'not_found' })
  })
}
