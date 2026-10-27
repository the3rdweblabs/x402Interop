// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import type { SettleRequest, VerifyRequest } from '@x402interop/core'
import {
  facilitatorRequestSchema,
  settlePayment,
  supportedResponse,
  verifyPayment,
} from '@x402interop/facilkit'

import { supportedKinds } from './supported.js'

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

function jsonError(error: string, message: string, status: number): HttpResult {
  return { status, body: { error, message } }
}

export function routeFacilitator(method: string, path: string, body: unknown): HttpResult {
  if (method === 'GET' && path === '/health') {
    return { status: 200, body: { status: 'ok', service: 'facilitator' } }
  }
  if (method === 'GET' && path === '/supported') {
    return { status: 200, body: supportedResponse(supportedKinds()) }
  }
  if (path === '/verify' || path === '/settle') {
    if (method !== 'POST') {
      return jsonError('method_not_allowed', 'Use POST', 405)
    }
    const parsed = facilitatorRequestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('invalid_request', 'Body does not match the facilitator request', 400)
    }
    const outcome =
      path === '/verify'
        ? verifyPayment(parsed.data as VerifyRequest)
        : settlePayment(parsed.data as SettleRequest)
    return { status: 200, body: outcome }
  }
  return jsonError('not_found', 'No such route', 404)
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

export async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req)
  if (raw !== '') {
    try {
      const body: unknown = JSON.parse(raw)
      const result = routeFacilitator(methodOf(req.method), requestPath(req.url), body)
      sendJson(res, result.status, result.body)
      return
    } catch {
      sendJson(res, 400, { error: 'invalid_json', message: 'Request body is not valid JSON' })
      return
    }
  }
  const result = routeFacilitator(methodOf(req.method), requestPath(req.url), undefined)
  sendJson(res, result.status, result.body)
}

export function createFacilitatorServer(): Server {
  return createServer((req, res) => {
    void dispatch(req, res)
  })
}
