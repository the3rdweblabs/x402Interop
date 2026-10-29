// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { enforceHardPriceCap } from '@x402interop/client'

export interface X402InteropClient {
  register: (scheme: string, handler: SchemeHandler) => void
}

export interface SchemeHandler {
  createPaymentPayload: (requirements: any, context?: any) => Promise<any> | any
}

export interface RegisterX402InteropOptions {
  maxPriceCap?: string
  privateKey?: `0x${string}`
  signer?: (payload: any) => Promise<any>
}

export function registerX402Interop(
  client: X402InteropClient,
  options: RegisterX402InteropOptions = {},
) {
  const schemes = ['x402interop-evm', 'x402interop-svm', 'x402interop-sui', 'x402interop-near']
  
  for (const scheme of schemes) {
    client.register(scheme, {
      createPaymentPayload: async (requirements: any, context?: any) => {
        if (options.maxPriceCap) {
          try {
            enforceHardPriceCap({ accepts: [requirements] }, options.maxPriceCap)
          } catch (err) {
            throw err
          }
        }
        
        const extra = requirements.extra || {}
        const binding = {
          quoteId: extra.quoteId,
          depositAddress: extra.depositAddress,
          nonce: extra.nonce || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          expiresAt: extra.expiresAt,
        }
        
        // For x402interop, pay to depositAddress (not payTo)
        const payload: any = {
          x402Version: 2,
          payload: {
            authorization: {
              to: extra.depositAddress || requirements.payTo,
              amount: requirements.amount,
              asset: requirements.asset,
              from: options.signer ? undefined : context?.from,
            },
            binding,
          },
        }
        
        if (options.signer) {
          payload.payload.authorization = await options.signer(payload.payload.authorization)
        }
        
        return payload
      },
    })
  }
  
  return client
}

export default registerX402Interop
