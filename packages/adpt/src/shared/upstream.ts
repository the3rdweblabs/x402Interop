// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Loader for upstream `@x402/*` scheme implementations. Used by families
 * whose `exact` (and other) schemes are covered by an official package:
 * evm, svm, near, tvm, xrpl, aptos, stellar.
 *
 * The import is dynamic and defensive: a family that does not have its
 * upstream package installed fails closed with `unexpected_verify_error`
 * rather than silently accepting payments.
 */
export interface UpstreamExact {
  verify(payload: unknown, requirements: unknown): Promise<unknown>
  settle(payload: unknown, requirements: unknown): Promise<unknown>
}

function pick(m: unknown, names: string[]): ((...args: unknown[]) => unknown) | undefined {
  for (const name of names) {
    const value = (m as Record<string, unknown>)?.[name]
    if (typeof value === 'function') return value as (...args: unknown[]) => unknown
  }
  return undefined
}

/** Walk a few plausible shapes until we find `{ verify, settle }`. */
function findImplementation(m: unknown): UpstreamExact | null {
  const candidates: unknown[] = [
    m,
    (m as Record<string, unknown>)?.exact,
    (m as Record<string, unknown>)?.['default'],
  ]
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue
    const verify = pick(c, ['verifyPayment', 'verify'])
    const settle = pick(c, ['settlePayment', 'settle'])
    if (verify && settle) {
      return {
        verify: async (payload: unknown, requirements: unknown) => verify(payload, requirements),
        settle: async (payload: unknown, requirements: unknown) => settle(payload, requirements),
      }
    }
  }
  return null
}

/** Fail closed when the upstream package cannot resolve or lacks the shape. */
export async function loadUpstreamExact(id: string): Promise<UpstreamExact | null> {
  try {
    const module = await import(id)
    return findImplementation(module)
  } catch {
    return null
  }
}
