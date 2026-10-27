// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

/** States the facilitator exposes. They are not the raw 1Click wire values. */
export type SwapState =
  | 'pending_deposit'
  | 'deposit_seen'
  | 'processing'
  | 'success'
  | 'refunded'
  | 'failed'

export const TERMINAL_STATES: readonly SwapState[] = ['success', 'refunded', 'failed']

export interface StatusEvent {
  quoteId: string
  state: SwapState
  originTxHash?: string
  destinationTxHash?: string
}

export interface TrackedSwap {
  quoteId: string
  state: SwapState
  originTxHash?: string
  destinationTxHash?: string
  updatedAt: string
}

export function isTerminal(state: SwapState): boolean {
  return TERMINAL_STATES.includes(state)
}

/**
 * In-memory tracker. A terminal state sticks so a late poll cannot reopen a
 * refunded payment. Nothing here calls 1Click.
 */
export class MemoryStatusTracker {
  private readonly swaps = new Map<string, TrackedSwap>()

  get(quoteId: string): TrackedSwap | undefined {
    return this.swaps.get(quoteId)
  }

  list(): TrackedSwap[] {
    return [...this.swaps.values()]
  }

  record(event: StatusEvent, now: Date = new Date()): TrackedSwap {
    const current = this.swaps.get(event.quoteId)
    if (current && isTerminal(current.state)) return current
    const next: TrackedSwap = {
      quoteId: event.quoteId,
      state: event.state,
      updatedAt: now.toISOString(),
    }
    if (event.originTxHash) next.originTxHash = event.originTxHash
    else if (current?.originTxHash) next.originTxHash = current.originTxHash
    if (event.destinationTxHash) next.destinationTxHash = event.destinationTxHash
    else if (current?.destinationTxHash) next.destinationTxHash = current.destinationTxHash
    this.swaps.set(event.quoteId, next)
    return next
  }
}
