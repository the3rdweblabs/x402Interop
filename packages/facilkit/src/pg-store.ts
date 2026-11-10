// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { PgPool } from './persistence.js'
import { parseServiceRecord, type ServiceRecord } from './services.js'
import type { FacilitatorStore } from './store.js'

/**
 * PostgreSQL-backed facilitator state.
 *
 * `create()` hydrates the service catalog once so startup can stay
 * synchronous. Quote, nonce, deposit, and catalog writes go straight to
 * PostgreSQL and are awaited by the facilitator.
 */
export class PostgresFacilitatorStore implements FacilitatorStore {
  private services: ServiceRecord[]

  private constructor(
    private readonly pool: PgPool,
    services: ServiceRecord[],
  ) {
    this.services = services
  }

  static async create(pool: PgPool): Promise<PostgresFacilitatorStore> {
    const result = await pool.query<{ payload: unknown }>(
      'SELECT payload FROM marketplace_resources ORDER BY updated_at DESC',
    )
    const services: ServiceRecord[] = []
    for (const row of result.rows) {
      try {
        services.push(parseServiceRecord(row.payload))
      } catch {
        // Never fail startup on one malformed listing.
      }
    }
    return new PostgresFacilitatorStore(pool, services)
  }

  async saveQuote(quoteId: string, data: any): Promise<void> {
    const record = data as { depositAddress?: unknown; expiresAt?: unknown }
    const depositAddress = typeof record?.depositAddress === 'string' ? record.depositAddress : ''
    if (depositAddress === '') {
      throw new Error('Quote payload is missing depositAddress')
    }
    const parsedExpiry =
      typeof record?.expiresAt === 'string'
        ? new Date(record.expiresAt)
        : new Date(Date.now() + 300_000)
    const expiresAt = Number.isNaN(parsedExpiry.getTime())
      ? new Date(Date.now() + 300_000)
      : parsedExpiry
    await this.pool.query(
      `INSERT INTO facilitator_quotes (quote_id, payload, deposit_address, expires_at)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (quote_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         deposit_address = EXCLUDED.deposit_address,
         expires_at = EXCLUDED.expires_at`,
      [quoteId, JSON.stringify(data), depositAddress, expiresAt],
    )
  }

  async getQuote(quoteId: string): Promise<any> {
    const result = await this.pool.query<{ payload: unknown }>(
      'SELECT payload FROM facilitator_quotes WHERE quote_id = $1',
      [quoteId],
    )
    return result.rows[0]?.payload
  }

  async addNonce(nonce: string): Promise<void> {
    await this.pool.query(
      'INSERT INTO facilitator_nonces (nonce) VALUES ($1) ON CONFLICT (nonce) DO NOTHING',
      [nonce],
    )
  }

  async hasNonce(nonce: string): Promise<boolean> {
    const result = await this.pool.query<{ nonce: string }>(
      'SELECT nonce FROM facilitator_nonces WHERE nonce = $1',
      [nonce],
    )
    return result.rows.length > 0
  }

  async saveDepositMapping(quoteId: string, depositAddress: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO facilitator_deposits (quote_id, deposit_address)
       VALUES ($1, $2)
       ON CONFLICT (quote_id) DO UPDATE SET deposit_address = EXCLUDED.deposit_address`,
      [quoteId, depositAddress],
    )
  }

  async getDepositAddress(quoteId: string): Promise<string | undefined> {
    const result = await this.pool.query<{ depositAddress: string }>(
      'SELECT deposit_address AS "depositAddress" FROM facilitator_deposits WHERE quote_id = $1',
      [quoteId],
    )
    return result.rows[0]?.depositAddress
  }

  listServices(): unknown[] {
    return this.services
  }

  async saveServices(services: unknown[]): Promise<void> {
    const records = services.map((service) => parseServiceRecord(service))
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM marketplace_resources WHERE NOT (id = ANY($1::text[]))', [
        records.map((record) => record.id),
      ])
      for (const record of records) {
        await client.query(
          `INSERT INTO marketplace_resources (id, owner, payload, health, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             owner = EXCLUDED.owner,
             payload = EXCLUDED.payload,
             health = EXCLUDED.health,
             updated_at = EXCLUDED.updated_at`,
          [
            record.id,
            record.owner,
            JSON.stringify(record),
            record.health,
            record.updatedAt ?? new Date().toISOString(),
          ],
        )
      }
      await client.query('COMMIT')
      this.services = records
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
