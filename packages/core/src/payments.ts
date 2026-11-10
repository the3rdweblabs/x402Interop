// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Payment types come from upstream x402 v2. We never redefine the wire
 * format: a requirement, payload, or 402 body must be interchangeable with
 * any other x402 v2 implementation.
 */
export type {
  AssetAmount,
  DefaultAsset,
  FacilitatorContext,
  FacilitatorExtension,
  Money,
  MoneyParser,
  Network,
  PaymentPayload,
  PaymentPayloadContext,
  PaymentPayloadResult,
  PaymentRequired,
  PaymentRequirements,
  Price,
  ResourceInfo,
  SchemeClientHooks,
  SchemeNetworkClient,
  SchemeNetworkFacilitator,
  SchemeNetworkServer,
  SchemePaymentRequiredContext,
  SchemeServerHooks,
  SettleRequest,
  SettleResponse,
  SupportedKind,
  SupportedResponse,
  VerifyRequest,
  VerifyResponse,
} from '@x402/core/types'

export type { ResourceConfig, RouteConfig, RoutesConfig } from '@x402/core/server'

import type { RouteConfig } from '@x402/core/server'
import type { PaymentRequirements } from '@x402/core/types'

/**
 * Upstream defines `PaymentOption` inside the route config but does not export
 * the alias yet. Derive it so callers still get the exact upstream shape.
 */
type ArrayElement<T> = T extends readonly (infer U)[] ? U : T
export type PaymentOption = ArrayElement<RouteConfig['accepts']>
export type DynamicPayTo = Extract<PaymentOption['payTo'], (...args: never[]) => unknown>
export type DynamicPrice = Extract<PaymentOption['price'], (...args: never[]) => unknown>

/** True when `amount` is a positive atomic integer string. */
export function hasPaymentAmount(requirements: PaymentRequirements): boolean {
  return /^\d+$/.test(requirements.amount) && requirements.amount !== '0'
}

/**
 * True when a requirement is ready to be signed or settled. Upstream permits
 * a vacant `payTo` on a route so an extension can fill it during
 * `enrichPaymentRequiredResponse`; the value on the wire must not be vacant.
 */
export function hasPaymentPayTo(requirements: PaymentRequirements): boolean {
  return requirements.payTo.trim().length > 0
}
