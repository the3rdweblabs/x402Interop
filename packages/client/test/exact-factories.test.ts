// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { PaymentRequirements } from '@x402interop/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signer: {
    toSuiAddress: () => '0xsender',
    signTransaction: vi.fn(async () => ({ bytes: 'dHhieXRlcw==', signature: 'c2ln' })),
  },
  transaction: {
    setSender: vi.fn(),
    transferObjects: vi.fn(),
    build: vi.fn(async () => new Uint8Array([1, 2, 3])),
  },
  coinWithBalance: vi.fn(() => ({})),
  suiGrpc: vi.fn(),
  solanaSigner: {},
  nearSigner: {},
  stellarSigner: {},
}))

vi.mock('@mysten/sui/keypairs/ed25519', () => ({
  Ed25519Keypair: {
    fromSecretKey: vi.fn(() => mocks.signer),
  },
}))
vi.mock('@mysten/sui/grpc', () => ({
  SuiGrpcClient: class {
    constructor(options: unknown) {
      mocks.suiGrpc(options)
    }
  },
}))
vi.mock('@mysten/sui/transactions', () => ({
  Transaction: class {
    setSender = mocks.transaction.setSender
    transferObjects = mocks.transaction.transferObjects
    build = mocks.transaction.build
  },
  coinWithBalance: mocks.coinWithBalance,
}))
vi.mock('@solana/kit', () => ({
  createKeyPairSignerFromBytes: vi.fn(async () => mocks.solanaSigner),
  getBase58Encoder: () => ({ encode: () => new Uint8Array([1, 2]) }),
}))
vi.mock('@x402/svm/exact/client', () => ({
  ExactSvmScheme: class {
    scheme = 'exact'
    constructor(readonly signer: unknown) {}
  },
}))
vi.mock('@x402/near', () => ({
  createClientNearSigner: vi.fn(() => mocks.nearSigner),
}))
vi.mock('@x402/near/exact/client', () => ({
  ExactNearScheme: class {
    scheme = 'exact'
    constructor(readonly signer: unknown) {}
  },
}))
vi.mock('@x402/stellar', () => ({
  createEd25519Signer: vi.fn(() => mocks.stellarSigner),
}))
vi.mock('@x402/stellar/exact/client', () => ({
  ExactStellarScheme: class {
    scheme = 'exact'
    constructor(readonly signer: unknown) {}
  },
}))

import {
  createNearExactClient,
  createStellarExactClient,
  createSuiExactClient,
  createSvmExactClient,
} from '../src/exact.js'

const SUI_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'

function requirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'sui:mainnet',
    asset: SUI_USDC,
    amount: '1000000',
    payTo: `0x${'44'.repeat(32)}`,
    maxTimeoutSeconds: 300,
    extra: {},
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Sui exact client', () => {
  it('builds a signed USDC transfer to the deposit address', async () => {
    const client = createSuiExactClient({ secretKey: `0x${'11'.repeat(32)}` })
    const payload = await client.createPaymentPayload(2, requirements())

    expect(mocks.suiGrpc).toHaveBeenCalledWith({
      baseUrl: 'https://fullnode.mainnet.sui.io:443',
      network: 'mainnet',
    })
    expect(mocks.coinWithBalance).toHaveBeenCalledWith({
      type: SUI_USDC,
      balance: 1000000n,
    })
    expect(mocks.transaction.setSender).toHaveBeenCalledWith('0xsender')
    expect(mocks.transaction.transferObjects).toHaveBeenCalled()
    expect(payload).toEqual({
      x402Version: 2,
      payload: { transaction: 'dHhieXRlcw==', signature: 'c2ln' },
    })
  })

  it('accepts bech32 and raw secret strings', () => {
    expect(createSuiExactClient({ secretKey: 'suiprivkey1example' }).scheme).toBe('exact')
    expect(createSuiExactClient({ secretKey: 'raw-secret' }).scheme).toBe('exact')
  })

  it('rejects non-exact and non-Sui requirements before building', async () => {
    const client = createSuiExactClient({ secretKey: `0x${'11'.repeat(32)}` })
    await expect(
      client.createPaymentPayload(2, requirements({ scheme: 'x402interop-evm' })),
    ).rejects.toThrow('Unsupported scheme')
    await expect(
      client.createPaymentPayload(2, requirements({ network: 'eip155:8453' })),
    ).rejects.toThrow('Unsupported Sui network')
  })
})

describe('upstream exact client factories', () => {
  it('creates the Solana, NEAR, and Stellar wrappers', async () => {
    await expect(
      createSvmExactClient({ secretKey: 'base58-secret', rpcUrl: 'https://solana.example' }),
    ).resolves.toMatchObject({ scheme: 'exact' })
    expect(
      createNearExactClient({
        accountId: 'relayer.near',
        secretKey: 'ed25519:secret',
        rpcUrl: 'https://near.example',
      }),
    ).toMatchObject({ scheme: 'exact' })
    expect(
      createStellarExactClient({
        secretKey: 'S...',
        rpcUrl: 'https://stellar.example',
      }),
    ).toMatchObject({ scheme: 'exact' })
  })

  it('creates the wrappers without an explicit RPC URL', async () => {
    await expect(createSvmExactClient({ secretKey: 'base58-secret' })).resolves.toMatchObject({
      scheme: 'exact',
    })
    expect(
      createNearExactClient({ accountId: 'relayer.near', secretKey: 'ed25519:secret' }),
    ).toMatchObject({ scheme: 'exact' })
    expect(createStellarExactClient({ secretKey: 'S...' })).toMatchObject({ scheme: 'exact' })
  })
})
