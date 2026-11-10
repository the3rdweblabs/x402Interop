// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { createExactAdaptersFromEnv } from '../src/exact/env.js'

describe('exact adapter environment wiring', () => {
  it('enables Sui with only a public RPC', async () => {
    const adapters = await createExactAdaptersFromEnv({
      EXACT_FAMILIES: 'sui',
      RPC_URL_SUI_MAINNET: 'https://fullnode.mainnet.sui.io:443',
    })

    expect(Object.keys(adapters)).toEqual(['sui:mainnet'])
    expect(adapters['sui:mainnet']).toMatchObject({
      scheme: 'exact',
      network: 'sui:mainnet',
      signers: [],
    })
  })

  it('does not advertise a signer-backed family without its key', async () => {
    const adapters = await createExactAdaptersFromEnv({
      EXACT_FAMILIES: 'svm,near,stellar',
      RPC_URL_SOLANA_MAINNET: 'https://api.mainnet-beta.solana.com',
      RPC_URL_NEAR_MAINNET: 'https://rpc.mainnet.fastnear.com',
      RPC_URL_STELLAR_MAINNET: 'https://soroban.example.invalid',
    })

    expect(adapters).toEqual({})
  })
})
