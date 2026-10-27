// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { x402interop, type SellerOptions } from '@x402interop/express'

/** NEAR seller paid in USDC. Native NEAR is not the payment asset. */
export const sellerOptions: SellerOptions = {
  facilitator: 'http://127.0.0.1:4020',
  payTo: 'seller.near',
  network: 'near:mainnet',
  asset: 'usdc',
  price: '0.05',
  amount: '50000',
  deliveryMode: 'on_success',
}

export function sellerMiddleware() {
  return x402interop(sellerOptions)
}
