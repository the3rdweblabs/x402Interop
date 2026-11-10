// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Fastify binding. Re-exports the upstream `@x402/fastify` names verbatim so
 * migration is one import line, and adds a `paymentMiddleware` dispatcher:
 * when the second argument is a plain config object carrying `facilitator`,
 * our framework-agnostic `x402interop` middleware is used; otherwise upstream
 * middleware runs unchanged.
 */

import { paymentMiddleware as upstreamPaymentMiddleware } from '@x402/fastify'

import { x402interop, type SellerOptions } from './middleware.js'

export {
  FastifyAdapter,
  paymentMiddlewareFromConfig,
  paymentMiddlewareFromHTTPServer,
  RouteConfigurationError,
  setSettlementOverrides,
  SETTLEMENT_OVERRIDES_HEADER,
} from '@x402/fastify'

export * from './middleware.js'

/**
 * Drop-in `paymentMiddleware` with upstream's calling shapes, plus one: a
 * plain config object with a `facilitator` property builds our interop
 * middleware instead.
 */
export function paymentMiddleware(
  routes: any,
  facilitator: string | object,
  paywallConfig?: any,
  paywall?: any,
  sync?: boolean,
): any {
  if (
    facilitator !== null &&
    typeof facilitator === 'object' &&
    !Array.isArray(facilitator) &&
    'facilitator' in facilitator
  ) {
    return x402interop(facilitator as SellerOptions)
  }
  return (upstreamPaymentMiddleware as (...args: any[]) => any)(
    routes,
    facilitator,
    paywallConfig,
    paywall,
    sync,
  )
}
