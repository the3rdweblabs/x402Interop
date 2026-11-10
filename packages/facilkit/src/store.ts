// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * The state `createInteropFacilitator` needs to survive a restart.
 *
 * FileStore implements this synchronously for local use. PostgreSQL-backed
 * stores may return promises for writes and lookups; the facilitator awaits
 * every call, so both shapes work.
 */
export interface FacilitatorStore {
  saveQuote(quoteId: string, data: any): void | Promise<void>
  getQuote(quoteId: string): any | Promise<any>
  addNonce(nonce: string): void | Promise<void>
  hasNonce(nonce: string): boolean | Promise<boolean>
  saveDepositMapping(quoteId: string, depositAddress: string): void | Promise<void>
  getDepositAddress(quoteId: string): string | undefined | Promise<string | undefined>
  listServices(): unknown[]
  saveServices(services: unknown[]): void | Promise<void>
}

/**
 * Restart-durable facilitator store: quotes, consumed nonces, and
 * quote → deposit mappings. Used by `createInteropFacilitator`; nothing here
 * touches a chain or the network.
 */
export class FileStore implements FacilitatorStore {
  readonly filePath: string
  private readonly strict: boolean
  private data: {
    quotes: Record<string, any>
    nonces: string[]
    deposits: Record<string, string>
    services: unknown[]
  }

  constructor(filePath?: string, options: { strict?: boolean } = {}) {
    this.filePath =
      filePath ||
      process.env.FACILITATOR_STORE_PATH ||
      join(process.cwd(), '.data', 'facilitator-store.json')
    this.strict = options.strict ?? false
    this.data = this.load()
  }

  private load() {
    try {
      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf-8')
        return JSON.parse(content)
      }
    } catch (error) {
      if (!this.strict) return { quotes: {}, nonces: [], deposits: {}, services: [] }
      throw new Error(
        `Unable to load facilitator store "${this.filePath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    return { quotes: {}, nonces: [], deposits: {}, services: [] }
  }

  private save(): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    renameSync(temporaryPath, this.filePath)
  }

  saveQuote(quoteId: string, data: any) {
    this.data.quotes[quoteId] = data
    this.save()
  }

  getQuote(quoteId: string) {
    return this.data.quotes[quoteId]
  }

  addNonce(nonce: string) {
    if (!this.data.nonces.includes(nonce)) {
      this.data.nonces.push(nonce)
      this.save()
    }
  }

  hasNonce(nonce: string) {
    return this.data.nonces.includes(nonce)
  }

  saveDepositMapping(quoteId: string, depositAddress: string) {
    this.data.deposits[quoteId] = depositAddress
    this.save()
  }

  getDepositAddress(quoteId: string) {
    return this.data.deposits[quoteId]
  }

  listServices(): unknown[] {
    return this.data.services ?? []
  }

  saveServices(services: unknown[]) {
    this.data.services = services
    this.save()
  }
}

export const store = new FileStore()
