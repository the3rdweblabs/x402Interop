// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Next.js binding. Re-exports the upstream `@x402/next` names verbatim (no
 * `paymentMiddleware` dispatcher: upstream's Next API is proxy/handler
 * based), plus the interop builders from the shared middleware module.
 */

export {
  NextAdapter,
  paymentProxy,
  paymentProxyFromConfig,
  paymentProxyFromHTTPServer,
  setSettlementOverrides,
  withX402,
  withX402FromHTTPServer,
} from '@x402/next'

export * from './middleware.js'
