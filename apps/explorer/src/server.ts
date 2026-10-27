// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

export interface HttpResult {
  status: number
  body: unknown
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

export function routeExplorer(method: string, path: string): HttpResult {
  if (method === 'GET' && path === '/health') {
    return { status: 200, body: { status: 'ok', service: 'explorer' } }
  }
  if (method === 'GET' && path === '/') {
    return {
      status: 200,
      body: {
        name: 'x402interop explorer',
        status: 'scaffold',
        note: 'Receipts and corridors will show up here once settlement exists.',
      },
    }
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

export async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await readBody(req)
  const result = routeExplorer(methodOf(req.method), requestPath(req.url))
  sendJson(res, result.status, result.body)
}

export function createExplorerServer(): Server {
  return createServer((req, res) => {
    void dispatch(req, res)
  })
}
