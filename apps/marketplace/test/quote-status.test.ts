// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  describeQuoteState,
  fetchQuoteStatus,
  isTerminalQuoteState,
  watchQuote,
  type QuoteState,
  type QuoteStatus,
} from '../src/lib/quote-status.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('quote state', () => {
  it('describes every state and flags the terminal ones', () => {
    const states: QuoteState[] = [
      'pending_deposit',
      'deposit_seen',
      'processing',
      'success',
      'refunded',
      'failed',
    ]
    for (const state of states) expect(describeQuoteState(state).length).toBeGreaterThan(10)
    expect(states.filter(isTerminalQuoteState)).toEqual(['success', 'refunded', 'failed'])
  })
})

describe('fetchQuoteStatus', () => {
  it('reads the facilitator status endpoint', async () => {
    const mock = vi.fn(
      async () =>
        new Response(JSON.stringify({ quoteId: 'q 1', state: 'success', deliverable: true }), {
          status: 200,
        }),
    )
    vi.stubGlobal('fetch', mock)
    await expect(fetchQuoteStatus('q 1', 'http://f.test')).resolves.toMatchObject({
      state: 'success',
    })
    expect(mock).toHaveBeenCalledWith('http://f.test/interop/status/q%201')
  })

  it('uses the configured facilitator when no base is given', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({ state: 'processing' })))
    vi.stubGlobal('fetch', mock)
    await fetchQuoteStatus('q')
    expect(mock).toHaveBeenCalledWith('http://127.0.0.1:4020/interop/status/q')
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404, statusText: 'Not Found' })),
    )
    await expect(fetchQuoteStatus('x', 'http://f.test')).rejects.toThrow('404 Not Found')
  })
})

describe('watchQuote', () => {
  it('stops at a terminal state', async () => {
    vi.useFakeTimers()
    const states: QuoteState[] = ['pending_deposit', 'processing', 'success']
    const fetcher = vi.fn(async (quoteId: string): Promise<QuoteStatus> => ({
      quoteId,
      state: states.shift() ?? 'success',
    }))
    const updates: string[] = []
    watchQuote('q', (update) => updates.push('error' in update ? 'error' : update.state), {
      intervalMs: 1000,
      fetcher,
    })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(updates).toEqual(['pending_deposit', 'processing', 'success'])
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('reports errors and keeps polling', async () => {
    vi.useFakeTimers()
    const fetcher = vi
      .fn<(quoteId: string) => Promise<QuoteStatus>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ quoteId: 'q', state: 'failed' })
    const updates: unknown[] = []
    watchQuote('q', (update) => updates.push(update), { intervalMs: 500, fetcher })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(updates).toEqual([{ error: 'offline' }, { quoteId: 'q', state: 'failed' }])
  })

  it('stops when the caller cancels', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async (quoteId: string): Promise<QuoteStatus> => ({
      quoteId,
      state: 'pending_deposit',
    }))
    const stop = watchQuote('q', () => undefined, { intervalMs: 100, fetcher })
    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('gives up after the timeout', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async (quoteId: string): Promise<QuoteStatus> => ({
      quoteId,
      state: 'pending_deposit',
    }))
    watchQuote('q', () => undefined, { intervalMs: 100, timeoutMs: 250, fetcher })
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(4)
    const calls = fetcher.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetcher.mock.calls.length).toBe(calls)
  })

  it('polls the facilitator by default and stops at a terminal state', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ quoteId: 'q', state: 'refunded' }))),
    )
    const onUpdate = vi.fn()
    watchQuote('q', onUpdate)
    await vi.advanceTimersByTimeAsync(0)
    expect(onUpdate).toHaveBeenCalledWith({ quoteId: 'q', state: 'refunded' })
  })

  it('ignores a response that arrives after cancelling', async () => {
    vi.useFakeTimers()
    let resolve: (value: QuoteStatus) => void = () => undefined
    const fetcher = vi.fn(
      () =>
        new Promise<QuoteStatus>((done) => {
          resolve = done
        }),
    )
    const onUpdate = vi.fn()
    const stop = watchQuote('q', onUpdate, { fetcher })
    stop()
    resolve({ quoteId: 'q', state: 'processing' })
    await vi.advanceTimersByTimeAsync(0)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('ignores a failure that arrives after cancelling', async () => {
    vi.useFakeTimers()
    let reject: (reason: unknown) => void = () => undefined
    const fetcher = vi.fn(
      () =>
        new Promise<QuoteStatus>((_done, fail) => {
          reject = fail
        }),
    )
    const onUpdate = vi.fn()
    const stop = watchQuote('q', onUpdate, { fetcher })
    stop()
    reject('offline')
    await vi.advanceTimersByTimeAsync(0)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('does not stop before the first status arrives if cancelled early', async () => {
    vi.useFakeTimers()
    const onUpdate = vi.fn()
    const fetcher = vi.fn(async (quoteId: string): Promise<QuoteStatus> => ({
      quoteId,
      state: 'success',
    }))
    const stop = watchQuote('q', onUpdate, { fetcher })
    stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
