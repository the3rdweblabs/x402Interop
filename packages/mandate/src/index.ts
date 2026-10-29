// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/** Human-signed spend policy. Amounts are decimal strings in the budget's unit. */
export interface Mandate {
  budget: string
  period: 'day' | 'week' | 'month'
  allowedServices: string[]
  perCallMax: string
  expires: string
}

export interface Spend {
  serviceId: string
  amount: string
  spentInPeriod: string
  now: Date
}

export type MandateDenial =
  | 'expired'
  | 'service_not_allowed'
  | 'per_call_cap'
  | 'budget_exceeded'
  | 'invalid_amount'

export type MandateDecision = { allowed: true } | { allowed: false; reason: MandateDenial }

function asAmount(value: string): number {
  return Number(value)
}

/**
 * Decide whether a call fits the mandate. This does not sign or store anything.
 */
export function assessMandate(mandate: Mandate, spend: Spend): MandateDecision {
  const expiresAt = Date.parse(mandate.expires)
  if (Number.isNaN(expiresAt) || expiresAt <= spend.now.getTime()) {
    return { allowed: false, reason: 'expired' }
  }
  if (!mandate.allowedServices.includes(spend.serviceId)) {
    return { allowed: false, reason: 'service_not_allowed' }
  }
  const amount = asAmount(spend.amount)
  const cap = asAmount(mandate.perCallMax)
  const budget = asAmount(mandate.budget)
  const spent = asAmount(spend.spentInPeriod)
  if (![amount, cap, budget, spent].every((value) => Number.isFinite(value))) {
    return { allowed: false, reason: 'invalid_amount' }
  }
  if (amount > cap) return { allowed: false, reason: 'per_call_cap' }
  if (spent + amount > budget) return { allowed: false, reason: 'budget_exceeded' }
  return { allowed: true }
}
