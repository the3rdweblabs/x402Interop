// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Interop scheme role implementations: one per chain family, covering the
 * three upstream role contracts (`SchemeNetworkFacilitator`,
 * `SchemeNetworkServer`, `SchemeNetworkClient`). Quote minting is injected so
 * `adpt` never depends on `intents`; `facilkit`/`servers` wire it in.
 */

import {
  SCHEME_IDS,
  X402_VERSION,
  type AssetAmount,
  type ChainFamily,
  type Network,
  type PaymentPayload,
  type PaymentPayloadResult,
  type PaymentRequirements,
  type Price,
  type SchemeNetworkClient,
  type SchemeNetworkFacilitator,
  type SchemeNetworkServer,
  type SettleResponse,
  type VerifyResponse,
} from '@x402interop/core'

import { verifyInterop, settleInterop } from '../evm/interop.js'
import { verifyInterop as verifySvm, settleInterop as settleSvm } from '../svm/interop.js'
import { verifyInterop as verifySui, settleInterop as settleSui } from '../sui/interop.js'
import { verifyInterop as verifyNear, settleInterop as settleNear } from '../near/interop.js'
import { verifyInterop as verifyTon, settleInterop as settleTon } from '../ton/interop.js'
import { verifyInterop as verifyTron, settleInterop as settleTron } from '../tron/interop.js'
import { verifyInterop as verifyXrpl, settleInterop as settleXrpl } from '../xrpl/interop.js'
import { verifyInterop as verifyAptos, settleInterop as settleAptos } from '../aptos/interop.js'
import {
  verifyInterop as verifyStellar,
  settleInterop as settleStellar,
} from '../stellar/interop.js'
import {
  verifyInterop as verifyStarknet,
  settleInterop as settleStarknet,
} from '../starknet/interop.js'
import {
  verifyInterop as verifyLightning,
  settleInterop as settleLightning,
} from '../lightning/interop.js'
import { verifyInterop as verifyUtxo, settleInterop as settleUtxo } from '../utxo/interop.js'
import { entryForFamily } from '../upstream/manifest.js'

const CAIP_PATTERNS: Readonly<Record<ChainFamily, string>> = {
  evm: 'eip155:*',
  svm: 'solana:*',
  sui: 'sui:*',
  near: 'near:*',
  ton: 'tvm:*',
  tron: 'tron:*',
  xrpl: 'xrpl:*',
  aptos: 'aptos:*',
  stellar: 'stellar:*',
  starknet: 'starknet:*',
  lightning: 'lnbtc:*',
  utxo: 'bip122:*',
}

type VerifyFn = (
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) => Promise<VerifyResponse>
type SettleFn = (
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) => Promise<SettleResponse>

const IMPLEMENTATIONS: Readonly<Record<ChainFamily, { verify: VerifyFn; settle: SettleFn }>> = {
  evm: { verify: verifyInterop, settle: settleInterop },
  svm: { verify: verifySvm, settle: settleSvm },
  sui: { verify: verifySui, settle: settleSui },
  near: { verify: verifyNear, settle: settleNear },
  ton: { verify: verifyTon, settle: settleTon },
  tron: { verify: verifyTron, settle: settleTron },
  xrpl: { verify: verifyXrpl, settle: settleXrpl },
  aptos: { verify: verifyAptos, settle: settleAptos },
  stellar: { verify: verifyStellar, settle: settleStellar },
  starknet: { verify: verifyStarknet, settle: settleStarknet },
  lightning: { verify: verifyLightning, settle: settleLightning },
  utxo: { verify: verifyUtxo, settle: settleUtxo },
}

export interface QuoteMint {
  depositAddress: string
  quoteId: string
  nonce: string
  expiresAt: string
  originNetwork: Network
  originAsset: string
}

export interface QuoteMinter {
  mint(options: {
    buyerNetwork: Network
    buyerAsset: string
    buyerAddress: string
    sellerNetwork: Network
    sellerAsset: string
    sellerAddress: string
    amount: string
    deliveryMode: string
  }): Promise<QuoteMint>
}

export interface InteropClientSigner {
  sign(
    authorization: Record<string, unknown>,
  ): Promise<Record<string, unknown>> | Record<string, unknown>
  signerAddress(): string
}

/** Facilitator role: verifies and settles interop payments for one family. */
export function createInteropFacilitator(family: ChainFamily): SchemeNetworkFacilitator {
  const scheme = SCHEME_IDS[family]
  const implementation = IMPLEMENTATIONS[family]
  return {
    scheme,
    caipFamily: CAIP_PATTERNS[family],
    getExtra() {
      return undefined
    },
    getSigners() {
      return []
    },
    async verify(payload, requirements) {
      return implementation.verify(payload, requirements)
    },
    async settle(payload, requirements) {
      return implementation.settle(payload, requirements)
    },
  }
}

/**
 * Server role: enriches vacant interop entries per request. Each entry gets a
 * fresh quote whose deposit address becomes `payTo`; the seller address moves
 * to `extra.recipient` (locked wire format).
 */
export function createInteropServer(
  family: ChainFamily,
  quoteMinter: QuoteMinter,
  options: { recipientOverride?: string; maxTimeoutSeconds?: number } = {},
): SchemeNetworkServer {
  const scheme = SCHEME_IDS[family]
  return {
    scheme,
    defaultAssetTransferMethod: 'default',
    paymentFlows: {
      default: { supported: ['authorization'], default: 'authorization' },
    },
    dynamicExtraFields: ['quoteId', 'depositAddress', 'nonce', 'expiresAt', 'recipient'],
    async parsePrice(price: Price): Promise<AssetAmount> {
      // Interop entries carry concrete atomic amounts; strip a US dollar
      // prefix when the seller prices in money strings and let the quote
      // layer resolve assets.
      const amount =
        typeof price === 'string' ? price.replace(/^\$/, '') : (price as AssetAmount).amount
      const asset = typeof price === 'string' ? '' : (price as AssetAmount).asset
      return { amount, asset }
    },
    async enhancePaymentRequirements(
      requirements: PaymentRequirements,
    ): Promise<PaymentRequirements> {
      return requirements
    },
    async enrichPaymentRequiredResponse(ctx) {
      const enriched: PaymentRequirements[] = []
      for (const requirement of ctx.requirements) {
        if (requirement.scheme !== scheme) {
          enriched.push(requirement)
          continue
        }
        // Idempotent: never re-mint a filled entry.
        if (requirement.payTo.trim().length > 0) {
          enriched.push(requirement)
          continue
        }
        const recipient = options.recipientOverride ?? ''
        const quote = await quoteMinter.mint({
          buyerNetwork: requirement.network,
          buyerAsset: requirement.asset,
          buyerAddress: recipient,
          sellerNetwork: requirement.network,
          sellerAsset: requirement.asset,
          sellerAddress: recipient,
          amount: requirement.amount,
          deliveryMode: 'on_deposit',
        })
        enriched.push({
          ...requirement,
          payTo: quote.depositAddress,
          maxTimeoutSeconds: requirementsMaxTimeout(requirement, options.maxTimeoutSeconds),
          extra: {
            ...requirement.extra,
            recipient,
            quoteId: quote.quoteId,
            depositAddress: quote.depositAddress,
            nonce: quote.nonce,
            expiresAt: quote.expiresAt,
          } as PaymentRequirements['extra'],
        })
        const responseExtensions = (
          ctx.paymentRequiredResponse as {
            extensions?: Record<string, unknown>
          }
        ).extensions
        if (responseExtensions) {
          responseExtensions.x402interop = {
            quoteId: quote.quoteId,
            depositAddress: quote.depositAddress,
            recipient,
          }
        }
      }
      return enriched
    },
  }
}

function requirementsMaxTimeout(
  requirement: PaymentRequirements,
  override: number | undefined,
): number {
  return override ?? requirement.maxTimeoutSeconds
}

/** Client role: builds the signed interop payload (authorization + binding). */
export function createInteropClient(
  family: ChainFamily,
  options: { signer?: InteropClientSigner } = {},
): SchemeNetworkClient {
  const scheme = SCHEME_IDS[family]
  return {
    scheme,
    async createPaymentPayload(
      x402Version: number,
      requirements: PaymentRequirements,
    ): Promise<PaymentPayloadResult> {
      const extra = requirements.extra ?? {}
      const binding = {
        quoteId: String(extra.quoteId ?? ''),
        depositAddress: String(extra.depositAddress ?? requirements.payTo),
        nonce: String(extra.nonce ?? '') || randomNonce(),
        expiresAt: String(extra.expiresAt ?? ''),
      }
      let authorization: Record<string, unknown> = {
        to: binding.depositAddress,
        amount: requirements.amount,
        asset: requirements.asset,
        network: requirements.network,
      }
      if (options.signer) {
        authorization = await options.signer.sign({
          ...authorization,
          from: options.signer.signerAddress(),
        })
      }
      return {
        x402Version: x402Version === 2 ? 2 : X402_VERSION,
        payload: { authorization, binding },
        extensions: {
          x402interop: {
            quoteId: binding.quoteId,
            depositAddress: binding.depositAddress,
            recipient: extra.recipient,
          },
        },
      }
    },
  }
}

function randomNonce(): string {
  const crypto: { randomUUID?: () => string } | undefined =
    typeof globalThis.crypto === 'object'
      ? (globalThis.crypto as { randomUUID?: () => string })
      : undefined
  if (crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function interopSchemeForFamily(family: ChainFamily): string {
  return SCHEME_IDS[family]
}

export function caipPatternForFamily(family: ChainFamily): string {
  return entryForFamily(family)?.caipNamespace
    ? `${entryForFamily(family)?.caipNamespace}:*`
    : CAIP_PATTERNS[family]
}
