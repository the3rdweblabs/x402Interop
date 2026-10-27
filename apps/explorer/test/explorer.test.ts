// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import type { Server } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createExplorerServer, methodOf, requestPath, routeExplorer } from '../src/index.js'

describe('explorer', () => {
  it('normalises method and path', () => {
    expect(methodOf(undefined)).toBe('GET')
    expect(methodOf('GET')).toBe('GET')
    expect(requestPath(undefined)).toBe('/')
    expect(requestPath('')).toBe('/')
    expect(requestPath('/health')).toBe('/health')
    expect(requestPath('/health?x=1')).toBe('/health')
    expect(requestPath('?')).toBe('/')
  })

  it('serves health, a scaffold index, and 404', () => {
    expect(routeExplorer('GET', '/health')).toMatchObject({ body: { service: 'explorer' } })
    expect(routeExplorer('POST', '/health').status).toBe(404)
    expect(routeExplorer('GET', '/')).toMatchObject({ body: { status: 'scaffold' } })
    expect(routeExplorer('POST', '/').status).toBe(404)
    expect(routeExplorer('GET', '/missing').status).toBe(404)
  })
})

describe('HTTP server', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = createExplorerServer()
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP port')
    base = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('answers GET /', async () => {
    const response = await fetch(base)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'x402interop explorer' })
  })
})
