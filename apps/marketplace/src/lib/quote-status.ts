// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { facilitatorUrl } from './facilitator.js'

export type QuoteState =
  | 'pending_deposit'
  | 'deposit_seen'
  | 'processing'
  | 'success'
  | 'refunded'
  | 'failed'

export const TERMINAL_QUOTE_STATES: readonly QuoteState[] = ['success', 'refunded', 'failed']

export interface QuoteStatus {
  quoteId: string
  state: QuoteState
  deliverable?: boolean
}

const DESCRIPTIONS: Record<QuoteState, string> = {
  pending_deposit: 'Waiting for your deposit to arrive at the deposit address.',
  deposit_seen: 'Deposit seen. Waiting for it to settle.',
  processing: 'Settling the payment to the seller.',
  success: 'Paid. The seller has received the funds.',
  refunded: 'The payment was refunded to your refund address.',
  failed: 'The payment failed. Check the status before trying again.',
}

export function describeQuoteState(state: QuoteState): string {
  return DESCRIPTIONS[state]
}

export function isTerminalQuoteState(state: QuoteState): boolean {
  return TERMINAL_QUOTE_STATES.includes(state)
}

export async function fetchQuoteStatus(quoteId: string, base?: string): Promise<QuoteStatus> {
  const response = await fetch(
    `${base ?? facilitatorUrl()}/interop/status/${encodeURIComponent(quoteId)}`,
  )
  if (!response.ok) {
    throw new Error(`Status returned ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as QuoteStatus
}

export interface WatchOptions {
  intervalMs?: number
  timeoutMs?: number
  fetcher?: (quoteId: string) => Promise<QuoteStatus>
}

/**
 * Polls the quote until it reaches a terminal state or the timeout passes.
 * Returns a function that stops watching.
 */
export function watchQuote(
  quoteId: string,
  onUpdate: (status: QuoteStatus | { error: string }) => void,
  options: WatchOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 5000
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000
  const fetcher = options.fetcher ?? ((id: string) => fetchQuoteStatus(id))
  const deadline = Date.now() + timeoutMs
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const tick = () => {
    if (stopped) return
    fetcher(quoteId)
      .then((status) => {
        if (stopped) return
        onUpdate(status)
        if (isTerminalQuoteState(status.state)) {
          stopped = true
          return
        }
        schedule()
      })
      .catch((error: unknown) => {
        if (stopped) return
        onUpdate({ error: error instanceof Error ? error.message : String(error) })
        schedule()
      })
  }

  const schedule = () => {
    if (stopped) return
    if (Date.now() >= deadline) {
      stopped = true
      return
    }
    timer = setTimeout(tick, intervalMs)
  }

  tick()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
