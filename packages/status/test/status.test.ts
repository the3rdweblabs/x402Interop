// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { describe, expect, it } from 'vitest'

import { isTerminal, MemoryStatusTracker } from '../src/index.js'

describe('MemoryStatusTracker', () => {
  const now = new Date('2026-10-27T12:00:00Z')

  it('knows which states are terminal', () => {
    expect(isTerminal('success')).toBe(true)
    expect(isTerminal('refunded')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('processing')).toBe(false)
  })

  it('records progress and keeps earlier transaction hashes', () => {
    const tracker = new MemoryStatusTracker()
    expect(tracker.get('q-1')).toBeUndefined()
    tracker.record({ quoteId: 'q-1', state: 'deposit_seen', originTxHash: '0xorigin' }, now)
    const next = tracker.record({ quoteId: 'q-1', state: 'processing' }, now)
    expect(next.originTxHash).toBe('0xorigin')
    expect(next.destinationTxHash).toBeUndefined()
    expect(tracker.list()).toHaveLength(1)
  })

  it('stores a destination hash and then ignores further events', () => {
    const tracker = new MemoryStatusTracker()
    tracker.record(
      { quoteId: 'q-2', state: 'success', originTxHash: '0xo', destinationTxHash: '0xd' },
      now,
    )
    const stuck = tracker.record(
      { quoteId: 'q-2', state: 'failed', destinationTxHash: '0xother' },
      now,
    )
    expect(stuck.state).toBe('success')
    expect(stuck.destinationTxHash).toBe('0xd')
  })

  it('keeps an existing destination hash when a later event omits it', () => {
    const tracker = new MemoryStatusTracker()
    tracker.record({ quoteId: 'q-3', state: 'processing', destinationTxHash: '0xd' }, now)
    const next = tracker.record({ quoteId: 'q-3', state: 'processing', originTxHash: '0xo' }, now)
    expect(next.destinationTxHash).toBe('0xd')
    expect(next.originTxHash).toBe('0xo')
  })
})
