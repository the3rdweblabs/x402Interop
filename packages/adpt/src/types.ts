// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type {
  ChainFamily,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'

export type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'

/**
 * Transitional per-family adapter shape. Role contracts are the upstream
 * `SchemeNetwork{Facilitator,Server,Client}` interfaces built by
 * `createInterop{Facilitator,Server,Client}`; this shape survives only for
 * the internal registry.
 */
export interface FamilyAdapter {
  family: ChainFamily
  scheme: string
  schemes: string[]
  network: string
  networks: string[]
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>
}
