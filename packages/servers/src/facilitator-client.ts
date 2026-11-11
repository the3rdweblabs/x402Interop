// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * The seller's client for the facilitator's `/verify` and `/settle` routes.
 *
 * A seller does not hold chain clients or the quote store: the facilitator
 * does. So verification is a network call, and the middleware's job is to
 * translate its answer into an HTTP response. Kept separate from the
 * middleware so it can be replaced in tests and so a seller can point at any
 * facilitator implementation that speaks the same two routes.
 */

import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'

export interface FacilitatorRequest {
  facilitator: string
  apiKey?: string
}

export interface VerifyArgs {
  paymentPayload: PaymentPayload
  paymentRequirements: PaymentRequirements
}

/** Raised when the facilitator cannot be reached or answers nonsense. */
export class FacilitatorUnavailable extends Error {
  constructor(
    message: string,
    readonly reason?: unknown,
  ) {
    super(message)
    this.name = 'FacilitatorUnavailable'
  }
}

async function post(args: FacilitatorRequest, path: string, body: unknown): Promise<unknown> {
  const url = `${args.facilitator.replace(/\/$/, '')}${path}`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(args.apiKey ? { authorization: `Bearer ${args.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    // A network failure is not a payment failure: the buyer's money may be
    // fine. The middleware must not serve the resource, but it also must not
    // tell the buyer their payment is invalid.
    throw new FacilitatorUnavailable(`facilitator ${url} could not be reached`, err)
  }
  if (!response.ok) {
    throw new FacilitatorUnavailable(`facilitator ${url} answered ${response.status}`)
  }
  try {
    return (await response.json()) as unknown
  } catch (err) {
    throw new FacilitatorUnavailable(`facilitator ${url} returned non-JSON`, err)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function verifyWithFacilitator(
  args: FacilitatorRequest,
  request: VerifyArgs,
): Promise<VerifyResponse> {
  const body = await post(args, '/verify', {
    x402Version: 2,
    paymentPayload: request.paymentPayload,
    paymentRequirements: request.paymentRequirements,
  })
  if (isRecord(body) && typeof body.isValid === 'boolean') {
    return body as unknown as VerifyResponse
  }
  // A 200 that is not a verdict means the endpoint is not the one we expect.
  // Failing closed here is the safe reading: we learned nothing.
  throw new FacilitatorUnavailable('facilitator /verify returned no verdict')
}

export async function settleWithFacilitator(
  args: FacilitatorRequest,
  request: VerifyArgs,
): Promise<SettleResponse> {
  const body = await post(args, '/settle', {
    x402Version: 2,
    paymentPayload: request.paymentPayload,
    paymentRequirements: request.paymentRequirements,
  })
  if (isRecord(body) && typeof body.success === 'boolean') {
    return body as unknown as SettleResponse
  }
  throw new FacilitatorUnavailable('facilitator /settle returned no verdict')
}
