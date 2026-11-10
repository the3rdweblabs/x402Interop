// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

import {
  createPostgresPersistenceBackend,
  runPostgresMigrations,
  type PgPool,
} from '../src/persistence.js'

function poolMock(): PgPool & { queries: string[] } {
  const queries: string[] = []
  const query = vi.fn(async (text: string) => {
    queries.push(text)
    if (text.startsWith('SELECT version')) return { rows: [] }
    return { rows: [] }
  })
  return {
    queries,
    query,
    connect: async () => ({ query, release: vi.fn() }),
    end: vi.fn(async () => undefined),
  }
}

describe('PostgreSQL persistence foundation', () => {
  it('runs ordered migrations transactionally', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'x402-migrations-'))
    writeFileSync(join(directory, '002_second.sql'), 'CREATE TABLE second (id TEXT);')
    writeFileSync(join(directory, '001_first.sql'), 'CREATE TABLE first (id TEXT);')
    const pool = poolMock()

    await runPostgresMigrations(pool, directory)

    expect(pool.queries.indexOf('CREATE TABLE first (id TEXT);')).toBeLessThan(
      pool.queries.indexOf('CREATE TABLE second (id TEXT);'),
    )
    expect(pool.queries).toContain('COMMIT')
  })

  it('records idempotent payments and audit events', async () => {
    const pool = poolMock()
    const backend = createPostgresPersistenceBackend(pool)

    await backend.recordListingPayment({
      paymentId: 'payment-1',
      owner: 'seller',
      kind: 'registration',
      network: 'eip155:8453',
      asset: 'usdc',
      amount: '100000',
      treasury: '0xtreasury',
      transactionId: '0xtx',
      idempotencyKey: 'registration:seller:listing',
      status: 'settled',
    })
    await backend.recordAuditEvent({
      eventId: 'event-1',
      actor: 'seller',
      action: 'listing_registered',
      metadata: {},
    })
    await backend.close()

    expect(pool.queries.some((query) => query.includes('ON CONFLICT (idempotency_key)'))).toBe(true)
    expect(pool.queries.some((query) => query.includes('marketplace_audit_events'))).toBe(true)
  })

  it('finds an existing payment and closes the pool', async () => {
    const pool = poolMock()
    pool.query = vi.fn(async (text: string) => {
      pool.queries.push(text)
      if (text.includes('WHERE idempotency_key')) {
        return { rows: [{ paymentId: 'payment-1', idempotencyKey: 'key-1' }] }
      }
      return { rows: [] }
    }) as unknown as PgPool['query']
    const backend = createPostgresPersistenceBackend(pool)
    await expect(backend.findListingPayment('key-1')).resolves.toMatchObject({
      paymentId: 'payment-1',
    })
    await backend.close()
    expect(pool.end).toHaveBeenCalledOnce()
  })

  it('skips applied migrations and rolls back failed migrations', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'x402-migrations-applied-'))
    writeFileSync(join(directory, '001_first.sql'), 'CREATE TABLE first (id TEXT);')
    const pool = poolMock()
    pool.query = vi.fn(async (text: string) => {
      pool.queries.push(text)
      if (text.startsWith('SELECT version')) return { rows: [{ version: '001_first.sql' }] }
      return { rows: [] }
    }) as unknown as PgPool['query']
    pool.connect = async () => ({ query: pool.query, release: vi.fn() })
    await runPostgresMigrations(pool, directory)
    expect(pool.queries).not.toContain('CREATE TABLE first (id TEXT);')

    const failing = poolMock()
    failing.connect = async () => ({
      query: vi.fn(async (text: string) => {
        if (text.includes('CREATE TABLE IF NOT EXISTS')) throw new Error('database unavailable')
        return { rows: [] }
      }),
      release: vi.fn(),
    })
    await expect(runPostgresMigrations(failing, directory)).rejects.toThrow('database unavailable')
  })
})
