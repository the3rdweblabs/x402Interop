// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  NEAR_NETWORKS,
  STELLAR_NETWORKS,
  SUI_NETWORKS,
  SVM_NETWORKS,
  type Network,
  type PaymentPayload,
  type PaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
} from '@x402interop/core'
import type { FacilitatorNearSigner } from '@x402/near'
import { ExactNearScheme } from '@x402/near/exact/facilitator'
import type { FacilitatorStellarSigner } from '@x402/stellar'
import { ExactStellarScheme } from '@x402/stellar/exact/facilitator'
import type { FacilitatorSvmSigner } from '@x402/svm'
import { ExactSvmScheme } from '@x402/svm/exact/facilitator'

import { settleExact as settleSuiExact, verifyExact as verifySuiExact } from '../sui/exact.js'
import type { SuiExactClient } from '../sui/exact.js'

/** A configured `exact` implementation for one mainnet family. */
export interface ExactAdapter {
  scheme: 'exact'
  network: Network
  signers: string[]
  extra?: Record<string, unknown>
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>
}

export interface ExactRuntimeOptions {
  /** Sui exact uses the spec-native verifier plus an RPC client. */
  sui?: { client: SuiExactClient; network?: Network }
  /** Solana exact delegates to @x402/svm. */
  svm?: { signer: FacilitatorSvmSigner; network?: Network }
  /** NEAR exact delegates to @x402/near. */
  near?: { signer: FacilitatorNearSigner; network?: Network }
  /** Stellar exact delegates to @x402/stellar. */
  stellar?: { signers: FacilitatorStellarSigner[]; rpcUrl: string; network?: Network }
}

function bindSchemeMethods(scheme: {
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>
}): Pick<ExactAdapter, 'verify' | 'settle'> {
  return {
    verify: (payload, requirements) => scheme.verify(payload, requirements),
    settle: (payload, requirements) => scheme.settle(payload, requirements),
  }
}

/**
 * Build the exact adapter table for every family whose RPC/signer is
 * configured. A family with no configuration is omitted, so `/supported`
 * never advertises a rail the facilitator cannot verify or settle.
 */
export function createExactAdapters(options: ExactRuntimeOptions): Record<string, ExactAdapter> {
  const adapters: Record<string, ExactAdapter> = {}

  if (options.sui) {
    const network = options.sui.network ?? SUI_NETWORKS[0]
    adapters[network] = {
      scheme: 'exact',
      network,
      signers: [],
      verify: (payload, requirements) =>
        verifySuiExact(payload, requirements, { client: options.sui?.client }),
      settle: (payload, requirements) =>
        settleSuiExact(payload, requirements, { client: options.sui?.client }),
    }
  }

  if (options.svm) {
    const network = options.svm.network ?? SVM_NETWORKS[0]
    const scheme = new ExactSvmScheme(options.svm.signer)
    adapters[network] = {
      scheme: 'exact',
      network,
      signers: options.svm.signer.getAddresses().map(String),
      ...(scheme.getExtra(network) ? { extra: scheme.getExtra(network) } : {}),
      ...bindSchemeMethods(scheme),
    }
  }

  if (options.near) {
    const network = options.near.network ?? NEAR_NETWORKS[0]
    const scheme = new ExactNearScheme(options.near.signer)
    adapters[network] = {
      scheme: 'exact',
      network,
      signers: [...options.near.signer.getRelayerIds()],
      ...(scheme.getExtra(network) ? { extra: scheme.getExtra(network) } : {}),
      ...bindSchemeMethods(scheme),
    }
  }

  if (options.stellar) {
    const network = options.stellar.network ?? STELLAR_NETWORKS[0]
    const scheme = new ExactStellarScheme(options.stellar.signers, {
      rpcConfig: { url: options.stellar.rpcUrl },
      areFeesSponsored: true,
    })
    adapters[network] = {
      scheme: 'exact',
      network,
      signers: scheme.getSigners(network),
      ...(scheme.getExtra(network) ? { extra: scheme.getExtra(network) } : {}),
      ...bindSchemeMethods(scheme),
    }
  }

  return adapters
}
