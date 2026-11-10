// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { Network } from '@x402interop/core'
import { decodePaymentSignatureHeader } from '@x402/core/http'
import type { PaymentPayload, PaymentRequirements, SettleResponse } from '@x402interop/core'

export interface ListingFeeOption {
  network: Network
  asset: string
  amount: string
  treasury: string
  decimals?: number
  symbol?: string
}

export interface MarketplaceFeeConfig {
  registration: ListingFeeOption[]
  featured: {
    '30d': ListingFeeOption[]
    '60d': ListingFeeOption[]
  }
}

export interface ListingPaymentProcessor {
  settle(input: {
    paymentSignature: string
    paymentRequirements: ListingFeeOption
    resource: string
    metadata: unknown
  }): Promise<{ success: true; transaction: string } | { success: false; reason: string }>
}

export function createUpstreamListingPaymentProcessor(
  settle: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<SettleResponse>,
): ListingPaymentProcessor {
  return {
    async settle(input) {
      let payload: PaymentPayload
      try {
        payload = decodePaymentSignatureHeader(input.paymentSignature)
      } catch {
        return { success: false, reason: 'Invalid PAYMENT-SIGNATURE header' }
      }
      const requirements: PaymentRequirements = {
        scheme: 'exact',
        network: input.paymentRequirements.network,
        asset: input.paymentRequirements.asset,
        amount: input.paymentRequirements.amount,
        payTo: input.paymentRequirements.treasury,
        maxTimeoutSeconds: 300,
        extra: {},
      }
      try {
        const result = await settle(payload, requirements)
        if (result.success && result.transaction) {
          return { success: true, transaction: result.transaction }
        }
        return {
          success: false,
          reason: result.errorMessage ?? result.errorReason ?? 'Listing fee payment was rejected',
        }
      } catch (error) {
        return {
          success: false,
          reason: error instanceof Error ? error.message : 'Listing fee payment failed',
        }
      }
    },
  }
}

export function feeOptionsFor(
  config: MarketplaceFeeConfig,
  kind: 'registration' | 'featured',
  duration: '30d' | '60d' = '30d',
): ListingFeeOption[] {
  if (kind === 'registration') return config.registration
  return config.featured[duration]
}
