// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Quote and nonce state an interop adapter needs in order to verify a
 * payment. Adapters never own this state: the facilitator does. Passing a
 * store in keeps adapters pure and lets one facilitator instance share its
 * `FacilitatorStore` with every family.
 *
 * This is a structural subset of `FacilitatorStore` in `@x402interop/facilkit`,
 * declared here so `adpt` does not have to depend on `facilkit` (which would
 * be a cycle, since `facilkit` depends on `adpt`).
 */
export interface InteropQuoteStore {
  getQuote(quoteId: string): unknown | Promise<unknown>
  hasNonce(nonce: string): boolean | Promise<boolean>
}

/** The quote facts verification cares about. Anything else is ignored. */
export interface InteropQuote {
  depositAddress?: string
  depositMemo?: string
  /** Smallest origin-chain amount the quote will accept, in origin atomic units. */
  minAmountIn?: string
  expiresAt?: string
  [key: string]: unknown
}

/**
 * Restart-durable store backed by one JSON file. Used by callers that wire an
 * adapter outside a facilitator (scripts, tests, single-process sellers).
 * Mirrors the on-disk layout the facilitator has always written.
 */
export function createFileStore(filePath: string): InteropQuoteStore {
  return {
    async getQuote(quoteId) {
      const data = await read(filePath)
      return data.quotes?.[quoteId]
    },
    async hasNonce(nonce) {
      const data = await read(filePath)
      return Array.isArray(data.nonces) && data.nonces.includes(nonce)
    },
  }
}

async function read(filePath: string): Promise<{
  quotes?: Record<string, unknown>
  nonces?: unknown[]
}> {
  try {
    const { readFile } = await import('node:fs/promises')
    const content = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(content) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as { quotes?: Record<string, unknown>; nonces?: unknown[] }
    }
  } catch {
    // A missing or malformed file is an empty store, not a crash: a seller
    // starting before the facilitator has written anything must still work.
  }
  return {}
}

/**
 * Quote expiry. A quote with no `expiresAt` is treated as valid: expiry is an
 * optional field in the quote format, and refusing every quote that omits it
 * would reject well-formed facilitators.
 */
export function isQuoteValid(quote: InteropQuote | undefined | null): boolean {
  if (!quote) return false
  if (typeof quote.expiresAt !== 'string') return true
  const expiry = Date.parse(quote.expiresAt)
  if (!Number.isFinite(expiry)) return true
  return expiry > Date.now()
}

/** Narrow an unknown store result to the quote shape. */
export function asQuote(value: unknown): InteropQuote | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return value as InteropQuote
}
