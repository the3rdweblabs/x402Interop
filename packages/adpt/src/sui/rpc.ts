// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { SuiGrpcClient } from '@mysten/sui/grpc'

import type { SuiExactClient } from './exact.js'

export interface SuiRpcClientOptions {
  url: string
  network?: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
}

function bytesOf(transactionBase64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(transactionBase64, 'base64'))
}

/**
 * Sui gRPC adapter for the spec-native exact scheme. JSON-RPC is deprecated in
 * the Sui SDK; the facilitator uses the same gRPC transport as the buyer.
 */
export function createSuiRpcClient(urlOrOptions: string | SuiRpcClientOptions): SuiExactClient {
  const options =
    typeof urlOrOptions === 'string'
      ? { url: urlOrOptions, network: 'mainnet' as const }
      : { network: 'mainnet' as const, ...urlOrOptions }
  const client = new SuiGrpcClient({
    network: options.network,
    baseUrl: options.url,
  })

  return {
    async simulateTransaction(transactionBase64: string, _signature: string): Promise<void> {
      const result = await client.simulateTransaction({
        transaction: bytesOf(transactionBase64),
        include: { effects: true },
      })
      if (result.$kind === 'FailedTransaction') {
        throw new Error(result.FailedTransaction.status.error?.message ?? 'Sui simulation failed')
      }
    },
    async executeTransaction(
      transactionBase64: string,
      signature: string,
    ): Promise<{ digest: string }> {
      const result = await client.executeTransaction({
        transaction: bytesOf(transactionBase64),
        signatures: [signature],
        include: { effects: true },
      })
      if (result.$kind === 'FailedTransaction') {
        throw new Error(result.FailedTransaction.status.error?.message ?? 'Sui execution failed')
      }
      return { digest: result.Transaction.digest }
    },
  }
}
