// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export class FileStore {
  private filePath: string
  private data: {
    quotes: Record<string, any>
    nonces: string[]
    deposits: Record<string, string>
  }

  constructor(filePath?: string) {
    this.filePath = filePath || join(process.cwd(), '.data', 'facilitator-store.json')
    this.data = this.load()
  }

  private load() {
    try {
      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf-8')
        return JSON.parse(content)
      }
    } catch {
      // ignore
    }
    return { quotes: {}, nonces: [], deposits: {} }
  }

  private save() {
    try {
      const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'))
      const { mkdirSync } = require('node:fs')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
    } catch {
      // ignore
    }
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
}

export const store = new FileStore()
