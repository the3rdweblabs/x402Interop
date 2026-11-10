// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { AgentConfig } from './config.js'
import type { PaymentRequirementLike, SourcePayer } from './payer.js'

type Json = Record<string, unknown>

async function getJson(url: string, init?: RequestInit): Promise<{ status: number; body: Json }> {
  const res = await fetch(url, init)
  const text = await res.text()
  let body: Json
  try {
    body = JSON.parse(text) as Json
  } catch {
    body = { raw: text }
  }
  // x402 canonical transport: an empty 402 body with the requirements in
  // PAYMENT-REQUIRED (base64 JSON). Keep the body as a fallback.
  if (res.status === 402 && !Array.isArray(body.accepts)) {
    const header = res.headers.get('payment-required') ?? res.headers.get('PAYMENT-REQUIRED')
    if (header) {
      try {
        body = JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as Json
      } catch {
        // Leave the parsed body/fallback untouched.
      }
    }
  }
  return { status: res.status, body }
}

function base64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function formatUnits(atomic: string, decimals = 6): string {
  try {
    const neg = atomic.startsWith('-')
    const s = neg ? atomic.slice(1) : atomic
    const pad = s.padStart(decimals + 1, '0')
    const whole = pad.slice(0, -decimals)
    const frac = pad.slice(-decimals).replace(/0+$/, '')
    return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`
  } catch {
    return atomic
  }
}

export async function listResources(config: AgentConfig) {
  const { status, body } = await getJson(`${config.RESOURCE_BASE_URL}/catalog`)
  if (status >= 400) throw new Error(`Catalog failed: ${status} ${JSON.stringify(body)}`)
  return body
}

export async function buyAndFetchResource(
  resourceId: string,
  payer: SourcePayer,
  config: AgentConfig,
): Promise<Json> {
  const origin = payer.origin()
  const params = new URLSearchParams({
    buyerNetwork: origin.network,
    buyerAsset: origin.asset,
    buyerAssetId: origin.assetId,
    buyerAddress: origin.address,
  })
  const resourceUrl = `${config.RESOURCE_BASE_URL}/r/${encodeURIComponent(resourceId)}?${params}`

  const challenge = await getJson(resourceUrl)
  if (challenge.status === 200) {
    return { alreadyAccessible: true, resource: challenge.body }
  }
  if (challenge.status !== 402) {
    throw new Error(
      `Expected 402 challenge, got ${challenge.status}: ${JSON.stringify(challenge.body)}`,
    )
  }

  const accepts = (challenge.body.accepts as PaymentRequirementLike[] | undefined) ?? []
  const requirement = accepts[0]
  if (!requirement) throw new Error('402 response has no payment requirements')

  const paid = await payer.pay(requirement, config)
  const settlementRequest = {
    x402Version: 2,
    paymentRequirements: requirement,
    paymentPayload: {
      x402Version: 2,
      accepted: requirement,
      payload: (paid.paymentPayload as any).payload ?? paid.paymentPayload,
    },
  }
  const sig = base64(settlementRequest)

  // In live mode, 1Click may not have observed/settled the deposit immediately.
  const deadline = Date.now() + (config.MODE === 'live' ? 180_000 : 15_000)
  let last: { status: number; body: Json } | undefined
  while (Date.now() < deadline) {
    last = await getJson(resourceUrl, {
      headers: { 'PAYMENT-SIGNATURE': sig },
    })
    if (last.status === 200) {
      return {
        ok: true,
        resourceId,
        paidFrom: {
          singleSourceWallet: origin.address,
          originNetwork: origin.network,
          originAsset: origin.asset,
          amount: formatUnits(paid.amount, 6),
          amountAtomic: paid.amount,
          assetHint: 'USDC (6 decimals assumed for display)',
          txHash: paid.txHash,
          mode: paid.mode,
        },
        paidTo: {
          depositAddress: paid.depositAddress,
          sellerNetwork: requirement.network,
          sellerAsset: requirement.asset,
          sellerAmount: formatUnits(requirement.amount, 6),
          sellerAmountAtomic: requirement.amount,
        },
        result: last.body,
      }
    }
    const err = String(last.body.error ?? '')
    const settlement = (last.body.settlement ?? {}) as Json
    const reason = String(settlement.errorReason ?? settlement.invalidReason ?? err)
    if (
      config.MODE === 'live' &&
      (reason === 'payment_not_found' ||
        reason === 'payment_pending' ||
        reason === 'status_unavailable')
    ) {
      await sleep(5_000)
      continue
    }
    return {
      ok: false,
      resourceId,
      reason,
      paidFrom: {
        origin: origin.address,
        txHash: paid.txHash,
        amount: formatUnits(paid.amount, 6),
        amountAtomic: paid.amount,
        mode: paid.mode,
      },
      response: last.body,
    }
  }
  return {
    ok: false,
    resourceId,
    reason: 'timeout_waiting_for_settlement',
    paidFrom: {
      origin: origin.address,
      txHash: paid.txHash,
      amount: formatUnits(paid.amount, 6),
      amountAtomic: paid.amount,
      mode: paid.mode,
    },
    lastResponse: last?.body,
  }
}
