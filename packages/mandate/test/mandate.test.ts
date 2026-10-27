// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { describe, expect, it } from 'vitest'

import { assessMandate, type Mandate, type Spend } from '../src/index.js'

const mandate: Mandate = {
  budget: '50.00',
  period: 'week',
  allowedServices: ['price-feed'],
  perCallMax: '0.25',
  expires: '2026-11-15T00:00:00Z',
}

function spend(overrides: Partial<Spend> = {}): Spend {
  return {
    serviceId: 'price-feed',
    amount: '0.05',
    spentInPeriod: '1.00',
    now: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  }
}

describe('assessMandate', () => {
  it('allows a call inside the budget', () => {
    expect(assessMandate(mandate, spend())).toEqual({ allowed: true })
  })

  it('rejects expiry, unknown services, caps, the budget, and bad amounts', () => {
    const cases = [
      assessMandate(mandate, spend({ now: new Date('2026-12-01T00:00:00Z') })),
      assessMandate({ ...mandate, expires: 'not-a-date' }, spend()),
      assessMandate(mandate, spend({ serviceId: 'other' })),
      assessMandate(mandate, spend({ amount: '1.00' })),
      assessMandate(mandate, spend({ spentInPeriod: '50' })),
      assessMandate(mandate, spend({ amount: 'lots' })),
    ]
    const reasons = cases.map((decision) => (decision.allowed ? 'allowed' : decision.reason))
    expect(reasons).toEqual([
      'expired',
      'expired',
      'service_not_allowed',
      'per_call_cap',
      'budget_exceeded',
      'invalid_amount',
    ])
  })
})
