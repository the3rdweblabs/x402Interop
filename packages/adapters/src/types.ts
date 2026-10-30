// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

export type { ChainAdapter, PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse } from '@x402interop/core'
import type { ChainAdapter } from '@x402interop/core'

export interface FamilyAdapter extends ChainAdapter {
  family: string
  schemes: string[]
  networks: string[]
}
