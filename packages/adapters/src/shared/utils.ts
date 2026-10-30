// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function loadStore() {
  try {
    const storePath = join(process.cwd(), '.data', 'facilitator-store.json')
    if (existsSync(storePath)) {
      const content = readFileSync(storePath, 'utf-8')
      return JSON.parse(content)
    }
  } catch {}
  return { quotes: {}, nonces: [], deposits: {} }
}

export function hasNonceUsed(nonce: string) {
  const store = loadStore()
  return store.nonces?.includes(nonce)
}

export function getQuote(quoteId: string) {
  const store = loadStore()
  return store.quotes?.[quoteId]
}

export function isQuoteValid(quote: any) {
  if (!quote) return false
  if (quote.expiresAt) {
    if (new Date(quote.expiresAt).getTime() <= Date.now()) return false
  }
  return true
}
