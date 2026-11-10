// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createKeyPairSignerFromBytes, getBase58Encoder } from '@solana/kit'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { Transaction, coinWithBalance } from '@mysten/sui/transactions'
import { createClientNearSigner } from '@x402/near'
import { ExactNearScheme } from '@x402/near/exact/client'
import { createEd25519Signer } from '@x402/stellar'
import { ExactStellarScheme } from '@x402/stellar/exact/client'
import { ExactSvmScheme } from '@x402/svm/exact/client'
import type { PaymentPayload, PaymentRequirements } from '@x402interop/core'

export type ExactClientPayload = Pick<PaymentPayload, 'x402Version' | 'payload'>

export interface ExactClient {
  readonly scheme: 'exact'
  createPaymentPayload(
    x402Version: number,
    requirements: PaymentRequirements,
  ): Promise<ExactClientPayload>
}

export interface SuiExactClientOptions {
  /** Bech32 `suiprivkey…`, 0x-prefixed 32-byte hex, or a raw SDK secret. */
  secretKey: string
  rpcUrl?: string
  network?: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
}

function suiKeypair(secretKey: string): Ed25519Keypair {
  if (secretKey.startsWith('suiprivkey')) return Ed25519Keypair.fromSecretKey(secretKey)
  const hex = secretKey.startsWith('0x') ? secretKey.slice(2) : secretKey
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex, 'hex')))
  }
  return Ed25519Keypair.fromSecretKey(secretKey)
}

/**
 * Spec-native Sui exact client. The buyer signs one USDC transfer to the
 * 1Click deposit address; the facilitator dry-runs and executes the same bytes.
 */
export function createSuiExactClient(options: SuiExactClientOptions): ExactClient {
  const keypair = suiKeypair(options.secretKey)
  const client = new SuiGrpcClient({
    baseUrl: options.rpcUrl ?? 'https://fullnode.mainnet.sui.io:443',
    network: options.network ?? 'mainnet',
  })
  return {
    scheme: 'exact',
    async createPaymentPayload(x402Version, requirements) {
      if (requirements.scheme !== 'exact') {
        throw new Error(`Unsupported scheme: ${requirements.scheme}`)
      }
      if (requirements.network !== 'sui:mainnet' && requirements.network !== 'sui:testnet') {
        throw new Error(`Unsupported Sui network: ${requirements.network}`)
      }
      const transaction = new Transaction()
      transaction.setSender(keypair.toSuiAddress())
      const coin = coinWithBalance({
        type: requirements.asset,
        balance: BigInt(requirements.amount),
      })
      transaction.transferObjects([coin], requirements.payTo)
      const bytes = await transaction.build({ client })
      const signed = await keypair.signTransaction(bytes)
      return {
        x402Version,
        payload: {
          transaction: signed.bytes,
          signature: signed.signature,
        },
      }
    },
  }
}

export interface SvmExactClientOptions {
  /** Base58 Solana secret key. */
  secretKey: string
  rpcUrl?: string
}

export async function createSvmExactClient(options: SvmExactClientOptions): Promise<ExactClient> {
  const signer = await createKeyPairSignerFromBytes(getBase58Encoder().encode(options.secretKey))
  return new ExactSvmScheme(
    signer,
    options.rpcUrl ? { rpcUrl: options.rpcUrl } : undefined,
  ) as ExactClient
}

export interface NearExactClientOptions {
  accountId: string
  secretKey: string
  rpcUrl?: string
}

export function createNearExactClient(options: NearExactClientOptions): ExactClient {
  const signer = createClientNearSigner({
    accountId: options.accountId,
    secretKey: options.secretKey as Parameters<typeof createClientNearSigner>[0]['secretKey'],
    ...(options.rpcUrl ? { rpcUrls: { 'near:mainnet': options.rpcUrl } } : {}),
  })
  return new ExactNearScheme(signer) as ExactClient
}

export interface StellarExactClientOptions {
  /** Stellar classic (G) account secret key. */
  secretKey: string
  rpcUrl?: string
}

export function createStellarExactClient(options: StellarExactClientOptions): ExactClient {
  const signer = createEd25519Signer(options.secretKey, 'stellar:pubnet')
  return new ExactStellarScheme(
    signer,
    options.rpcUrl ? { url: options.rpcUrl } : undefined,
  ) as ExactClient
}
