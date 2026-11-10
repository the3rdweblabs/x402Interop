// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it, vi } from 'vitest'

import type { PgPool } from '../src/persistence.js'
import { PostgresFacilitatorStore } from '../src/pg-store.js'

const service = {
  id: 'weather',
  name: 'Weather',
  description: 'Current conditions',
  price: '0.01',
  networks: ['eip155:8453'],
  asset: 'USDC',
  owner: 'seller',
  resourceUrl: 'https://example.com/weather',
  health: 'healthy' as const,
}

interface QueryCall {
  text: string
  values?: readonly unknown[]
}

function poolMock(
  options: {
    resources?: unknown[]
    failInsert?: boolean
  } = {},
): PgPool & { calls: QueryCall[]; released: number } {
  const calls: QueryCall[] = []
  let released = 0
  const query = vi.fn(async (text: string, values?: readonly unknown[]) => {
    calls.push({ text, values })
    if (text.startsWith('SELECT payload FROM marketplace_resources')) {
      return { rows: (options.resources ?? []).map((payload) => ({ payload })) }
    }
    if (text.startsWith('SELECT payload FROM facilitator_quotes')) {
      return { rows: [{ payload: { quoteId: 'q1' } }] }
    }
    if (text.startsWith('SELECT nonce')) {
      return { rows: values?.[0] === 'used' ? [{ nonce: 'used' }] : [] }
    }
    if (text.startsWith('SELECT deposit_address')) {
      return { rows: values?.[0] === 'q1' ? [{ depositAddress: '0xdeposit' }] : [] }
    }
    if (options.failInsert && text.startsWith('INSERT INTO marketplace_resources')) {
      throw new Error('insert failed')
    }
    return { rows: [] }
  })
  return {
    calls,
    get released() {
      return released
    },
    query,
    connect: async () => ({
      query,
      release: () => {
        released += 1
      },
    }),
    end: vi.fn(async () => undefined),
  } as PgPool & { calls: QueryCall[]; released: number }
}

describe('PostgreSQL facilitator store', () => {
  it('hydrates valid listings and skips malformed rows', async () => {
    const pool = poolMock({ resources: [service, { name: 'broken' }] })
    const store = await PostgresFacilitatorStore.create(pool)

    expect(store.listServices()).toEqual([service])
    expect(pool.calls[0]?.text).toContain('FROM marketplace_resources')
  })

  it('writes and reads quotes', async () => {
    const pool = poolMock()
    const store = await PostgresFacilitatorStore.create(pool)

    await store.saveQuote('q1', {
      quoteId: 'q1',
      depositAddress: '0xdeposit',
      expiresAt: '2030-01-01T00:00:00.000Z',
    })
    const insert = pool.calls.find((call) => call.text.includes('INSERT INTO facilitator_quotes'))
    expect(insert?.values?.slice(0, 3)).toEqual(['q1', expect.any(String), '0xdeposit'])

    await expect(store.getQuote('q1')).resolves.toEqual({ quoteId: 'q1' })
  })

  it('falls back to a five-minute expiry and rejects a quote without a deposit address', async () => {
    const pool = poolMock()
    const store = await PostgresFacilitatorStore.create(pool)

    await store.saveQuote('q1', { depositAddress: '0xdeposit', expiresAt: 'not-a-date' })
    const insert = pool.calls.find((call) => call.text.includes('INSERT INTO facilitator_quotes'))
    const expiry = insert?.values?.[3]
    expect(expiry).toBeInstanceOf(Date)
    expect((expiry as Date).getTime()).toBeGreaterThan(Date.now())

    await expect(store.saveQuote('q2', {})).rejects.toThrow('depositAddress')
  })

  it('stores nonces idempotently and reads them back', async () => {
    const pool = poolMock()
    const store = await PostgresFacilitatorStore.create(pool)

    await store.addNonce('used')
    await store.addNonce('fresh')

    expect(
      pool.calls.filter((call) => call.text.includes('INSERT INTO facilitator_nonces')),
    ).toHaveLength(2)
    await expect(store.hasNonce('used')).resolves.toBe(true)
    await expect(store.hasNonce('fresh')).resolves.toBe(false)
  })

  it('stores and reads quote-to-deposit mappings', async () => {
    const pool = poolMock()
    const store = await PostgresFacilitatorStore.create(pool)

    await store.saveDepositMapping('q1', '0xdeposit')
    expect(pool.calls.some((call) => call.text.includes('INSERT INTO facilitator_deposits'))).toBe(
      true,
    )
    await expect(store.getDepositAddress('q1')).resolves.toBe('0xdeposit')
    await expect(store.getDepositAddress('missing')).resolves.toBeUndefined()
  })

  it('replaces the listing catalog in one transaction', async () => {
    const pool = poolMock()
    const store = await PostgresFacilitatorStore.create(pool)

    await store.saveServices([service])

    expect(store.listServices()).toEqual([service])
    const text = pool.calls.map((call) => call.text)
    expect(text).toContain('BEGIN')
    expect(text).toContain('COMMIT')
    expect(text.some((statement) => statement.includes('DELETE FROM marketplace_resources'))).toBe(
      true,
    )
    expect(text.some((statement) => statement.includes('INSERT INTO marketplace_resources'))).toBe(
      true,
    )
    expect(pool.released).toBe(1)
  })

  it('deletes every listing when the snapshot is empty', async () => {
    const pool = poolMock()
    const store = await PostgresFacilitatorStore.create(pool)

    await store.saveServices([])

    expect(store.listServices()).toEqual([])
    expect(pool.calls.some((call) => call.text.includes('INSERT INTO marketplace_resources'))).toBe(
      false,
    )
  })

  it('rolls back and keeps the previous catalog when a write fails', async () => {
    const pool = poolMock({ failInsert: true })
    const store = await PostgresFacilitatorStore.create(pool)

    await expect(store.saveServices([service])).rejects.toThrow('insert failed')
    expect(store.listServices()).toEqual([])
    expect(pool.calls.some((call) => call.text === 'ROLLBACK')).toBe(true)
    expect(pool.released).toBe(1)
  })

  it('rejects an invalid listing before opening a transaction', async () => {
    const pool = poolMock()
    const store = await PostgresFacilitatorStore.create(pool)

    await expect(store.saveServices([{ id: 'broken' }])).rejects.toThrow()
    expect(pool.calls.some((call) => call.text === 'BEGIN')).toBe(false)
  })
})
