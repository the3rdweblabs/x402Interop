// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ListingPaymentLedgerEntry {
  paymentId: string
  resourceId?: string
  owner: string
  kind: 'registration' | 'featured' | 'renewal'
  durationDays?: number
  network: string
  asset: string
  amount: string
  treasury: string
  transactionId: string
  idempotencyKey: string
  status: 'pending' | 'settled' | 'rejected' | 'refunded'
}

export interface AuditEvent {
  eventId: string
  actor: string
  action: string
  resourceId?: string
  paymentId?: string
  metadata: Record<string, unknown>
}

export interface PersistenceBackend {
  recordListingPayment(entry: ListingPaymentLedgerEntry): Promise<void>
  findListingPayment(idempotencyKey: string): Promise<ListingPaymentLedgerEntry | undefined>
  recordAuditEvent(event: AuditEvent): Promise<void>
  close(): Promise<void>
}

export interface PgQueryable {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>
}

export interface PgPool extends PgQueryable {
  connect(): Promise<{
    query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>
    release(): void
  }>
  end(): Promise<void>
}

export async function createPostgresPool(connectionString: string): Promise<PgPool> {
  const { Pool } = await import('pg')
  return new Pool({ connectionString }) as PgPool
}

export async function defaultMigrationsDirectory(): Promise<string> {
  const candidates = [
    join(process.cwd(), 'packages/facilkit/migrations'),
    join(process.cwd(), 'node_modules/@x402interop/facilkit/migrations'),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  throw new Error('Facilitator PostgreSQL migrations directory was not found')
}

export async function runPostgresMigrations(
  pool: PgPool,
  migrationsDirectory: string,
): Promise<void> {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      CREATE TABLE IF NOT EXISTS facilitator_schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    const applied = await client.query<{ version: string }>(
      'SELECT version FROM facilitator_schema_migrations',
    )
    const appliedVersions = new Set(applied.rows.map((row) => row.version))
    for (const file of files) {
      if (appliedVersions.has(file)) continue
      await client.query(await readFile(join(migrationsDirectory, file), 'utf8'))
      await client.query('INSERT INTO facilitator_schema_migrations (version) VALUES ($1)', [file])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export function createPostgresPersistenceBackend(pool: PgPool): PersistenceBackend {
  return {
    async recordListingPayment(entry) {
      await pool.query(
        `INSERT INTO marketplace_payments
          (payment_id, resource_id, owner, kind, duration_days, network, asset, amount,
           treasury, transaction_id, status, idempotency_key, settled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           CASE WHEN $11 = 'settled' THEN now() ELSE NULL END)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          entry.paymentId,
          entry.resourceId ?? null,
          entry.owner,
          entry.kind,
          entry.durationDays ?? null,
          entry.network,
          entry.asset,
          entry.amount,
          entry.treasury,
          entry.transactionId,
          entry.status,
          entry.idempotencyKey,
        ],
      )
    },
    async findListingPayment(idempotencyKey) {
      const result = await pool.query<ListingPaymentLedgerEntry>(
        `SELECT payment_id AS "paymentId", resource_id AS "resourceId", owner, kind,
                duration_days AS "durationDays", network, asset, amount, treasury,
                transaction_id AS "transactionId", idempotency_key AS "idempotencyKey",
                status
           FROM marketplace_payments
          WHERE idempotency_key = $1`,
        [idempotencyKey],
      )
      return result.rows[0]
    },
    async recordAuditEvent(event) {
      await pool.query(
        `INSERT INTO marketplace_audit_events
          (event_id, actor, action, resource_id, payment_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          event.eventId,
          event.actor,
          event.action,
          event.resourceId ?? null,
          event.paymentId ?? null,
          JSON.stringify(event.metadata),
        ],
      )
    },
    async close() {
      await pool.end()
    },
  }
}
