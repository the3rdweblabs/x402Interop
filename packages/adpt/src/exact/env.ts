// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createKeyPairSignerFromBytes, getBase58Encoder } from '@solana/kit'
import { createFacilitatorNearSigner, type FacilitatorNearSignerConfig } from '@x402/near'
import { createEd25519Signer } from '@x402/stellar'
import { toFacilitatorSvmSigner } from '@x402/svm'

import { createSuiRpcClient } from '../sui/rpc.js'
import { createExactAdapters, type ExactAdapter, type ExactRuntimeOptions } from './runtime.js'

const DEFAULT_SUI_RPC = 'https://fullnode.mainnet.sui.io:443'
const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com'
const DEFAULT_NEAR_RPC = 'https://rpc.mainnet.fastnear.com'

function enabled(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.EXACT_FAMILIES ?? 'sui,svm,near,stellar')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Build exact adapters from environment values. All upstream `@x402/*`
 * imports stay in this package; the facilitator app only passes `process.env`.
 *
 * A family is enabled only when its required RPC and signer exist. Sui needs
 * only a public RPC because the buyer signs a complete transaction.
 */
export async function createExactAdaptersFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, ExactAdapter>> {
  const families = enabled(env)
  const options: ExactRuntimeOptions = {}

  if (families.has('sui')) {
    options.sui = {
      client: createSuiRpcClient(env.RPC_URL_SUI_MAINNET || DEFAULT_SUI_RPC),
    }
  }

  if (families.has('svm') && env.RELAYER_KEY_SOLANA_MAINNET?.trim()) {
    const bytes = getBase58Encoder().encode(env.RELAYER_KEY_SOLANA_MAINNET.trim())
    const signer = await createKeyPairSignerFromBytes(bytes)
    options.svm = {
      signer: toFacilitatorSvmSigner(signer, {
        defaultRpcUrl: env.RPC_URL_SOLANA_MAINNET || DEFAULT_SOLANA_RPC,
      }),
    }
  }

  if (
    families.has('near') &&
    env.NEAR_RELAYER_ACCOUNT_ID?.trim() &&
    env.RELAYER_KEY_NEAR_MAINNET?.trim()
  ) {
    const relayers: FacilitatorNearSignerConfig['relayers'] = [
      {
        accountId: env.NEAR_RELAYER_ACCOUNT_ID.trim(),
        secretKey:
          env.RELAYER_KEY_NEAR_MAINNET.trim() as FacilitatorNearSignerConfig['relayers'][number]['secretKey'],
      },
    ]
    options.near = {
      signer: createFacilitatorNearSigner({
        relayers,
        rpcUrls: { 'near:mainnet': env.RPC_URL_NEAR_MAINNET || DEFAULT_NEAR_RPC },
      }),
    }
  }

  if (
    families.has('stellar') &&
    env.RELAYER_KEY_STELLAR_MAINNET?.trim() &&
    env.RPC_URL_STELLAR_MAINNET?.trim()
  ) {
    options.stellar = {
      signers: [createEd25519Signer(env.RELAYER_KEY_STELLAR_MAINNET.trim(), 'stellar:pubnet')],
      rpcUrl: env.RPC_URL_STELLAR_MAINNET.trim(),
    }
  }

  return createExactAdapters(options)
}
