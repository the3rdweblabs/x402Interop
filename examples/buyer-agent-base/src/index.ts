// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createScaffoldClient, type PreparePaymentInput } from '@x402interop/client'

/** Buyer that only holds funds on Base. Signing is intentionally absent. */
export const buyerAgent = {
  name: 'buyer-agent-base',
  buyerNetwork: 'eip155:8453',
  tools: [
    'search_services',
    'get_service',
    'prepare_payment',
    'pay_and_fetch',
    'payment_status',
  ] as const,
}

export const samplePrepare: PreparePaymentInput = {
  serviceId: 'price-feed',
  buyerNetwork: buyerAgent.buyerNetwork,
  buyerAsset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  buyerAddress: '0x0000000000000000000000000000000000000001',
}

export function describeBuyerFlow(): string {
  return 'Search for a service, prepare a Base payment, pay, and poll status. Signing and 1Click are not wired in the scaffold.'
}

export function buyerClient() {
  return createScaffoldClient()
}
