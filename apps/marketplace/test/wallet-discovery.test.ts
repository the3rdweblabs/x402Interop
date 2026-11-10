// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { afterEach, describe, expect, it, vi } from 'vitest'

import { listWallets, signAction, type WalletOption } from '../src/lib/wallet.js'

type Handler = (event: { type: string; detail?: unknown }) => void

const handlers = new Map<string, Handler[]>()
let registry: { register(...wallets: unknown[]): void } | undefined

const evmProvider = {
  request: vi.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_requestAccounts') return ['0xAbC0000000000000000000000000000000000001']
    if (method === 'personal_sign') return '0xsignature'
    return null
  }),
}

const suiAccount = { address: '0xsui', chains: ['sui:mainnet'] }
const suiWallet = {
  name: 'Sui Test',
  icon: 'data:,sui',
  chains: ['sui:mainnet'],
  accounts: [suiAccount],
  features: {
    'standard:connect': { connect: async () => ({ accounts: [suiAccount] }) },
    'sui:signPersonalMessage': {
      signPersonalMessage: async () => ({ bytes: 'b', signature: 'sui-signature' }),
    },
  },
}

const solanaAccount = { address: 'SoLAddr', chains: ['solana:mainnet'] }
const solanaWallet = {
  name: 'Solana Test',
  icon: 'data:,sol',
  chains: ['solana:mainnet'],
  accounts: [solanaAccount],
  features: {
    'standard:connect': { connect: async () => ({ accounts: [solanaAccount] }) },
    'solana:signMessage': {
      signMessage: async () => [{ signedMessage: new Uint8Array(), signature: Uint8Array.from([1, 2]) }],
    },
  },
}

const readOnlyWallet = {
  name: 'Read Only',
  icon: 'data:,ro',
  chains: ['sui:mainnet'],
  accounts: [],
  features: { 'standard:connect': { connect: async () => ({ accounts: [] }) } },
}

function fakeWindow() {
  return {
    addEventListener(type: string, handler: Handler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler])
    },
    dispatchEvent(event: { type: string; detail?: unknown }) {
      if (event.type === 'eip6963:requestProvider') {
        for (const handler of handlers.get('eip6963:announceProvider') ?? []) {
          handler({
            type: 'eip6963:announceProvider',
            detail: {
              info: { uuid: 'u1', name: 'Fake EVM', icon: 'i', rdns: 'test.evm' },
              provider: evmProvider,
            },
          })
        }
      }
      if (event.type === 'wallet-standard:app-ready') {
        registry = event.detail as typeof registry
        registry?.register(suiWallet, solanaWallet, readOnlyWallet)
      }
      return true
    },
  }
}

vi.stubGlobal('window', fakeWindow())

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extension discovery', () => {
  it('lists EIP-6963 EVM wallets and Wallet Standard Sui and Solana wallets', async () => {
    const options = await listWallets()
    const byFamily = Object.fromEntries(options.map((option) => [option.family, option.name]))
    expect(byFamily.evm).toBe('Fake EVM')
    expect(byFamily.sui).toBe('Sui Test')
    expect(byFamily.solana).toBe('Solana Test')
    expect(options.map((option) => option.name)).not.toContain('Read Only')
  })

  it('connects an EVM wallet and signs with personal_sign', async () => {
    const option = (await listWallets()).find((item) => item.family === 'evm') as WalletOption
    const wallet = await option.connect()
    expect(wallet.address).toBe('0xAbC0000000000000000000000000000000000001')
    expect(await wallet.signMessage('hi')).toBe('0xsignature')
    expect(evmProvider.request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: ['0x6869', wallet.address],
    })
  })

  it('connects a Sui wallet and returns the serialised signature', async () => {
    const option = (await listWallets()).find((item) => item.family === 'sui') as WalletOption
    const wallet = await option.connect()
    expect(wallet).toMatchObject({ family: 'sui', address: '0xsui', name: 'Sui Test' })
    expect(await wallet.signMessage('hello')).toBe('sui-signature')
  })

  it('connects a Solana wallet and base64-encodes the signature bytes', async () => {
    const option = (await listWallets()).find((item) => item.family === 'solana') as WalletOption
    const wallet = await option.connect()
    expect(wallet.address).toBe('SoLAddr')
    expect(await wallet.signMessage('hello')).toBe(Buffer.from([1, 2]).toString('base64'))
  })

  it('signs one action against the server challenge', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ nonce: 'n1', message: 'sign this' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const option = (await listWallets()).find((item) => item.family === 'evm') as WalletOption
    const wallet = await option.connect()
    const header = await signAction(wallet, 'PATCH', '/discovery/resources/weather', { name: 'x' })
    expect(JSON.parse(header)).toEqual({ nonce: 'n1', signature: '0xsignature' })
    const init = fetchMock.mock.calls[0]?.[1]
    const sent = JSON.parse(String(init?.body))
    expect(sent).toMatchObject({
      family: 'evm',
      address: wallet.address,
      method: 'PATCH',
      path: '/discovery/resources/weather',
    })
    expect(sent.bodyHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses wallets that return no account or no signature', async () => {
    const evm = (await listWallets()).find((item) => item.family === 'evm') as WalletOption
    evmProvider.request.mockResolvedValueOnce([])
    await expect(evm.connect()).rejects.toThrow('no account')

    const wrongChain = {
      name: 'Wrong Chain',
      icon: 'data:,wc',
      chains: ['sui:mainnet'],
      accounts: [],
      features: {
        'standard:connect': {
          connect: async () => ({ accounts: [{ address: 'x', chains: ['solana:mainnet'] }] }),
        },
        'sui:signPersonalMessage': { signPersonalMessage: async () => ({ signature: 's' }) },
      },
    }
    const emptySolana = {
      name: 'Empty Solana',
      icon: 'data:,es',
      chains: ['solana:mainnet'],
      accounts: [],
      features: {
        'standard:connect': { connect: async () => ({ accounts: [solanaAccount] }) },
        'solana:signMessage': { signMessage: async () => [] },
      },
    }
    registry?.register(wrongChain, emptySolana)
    const options = await listWallets()
    const sui = options.find((item) => item.name === 'Wrong Chain') as WalletOption
    await expect(sui.connect()).rejects.toThrow('has no sui account')
    const solana = options.find((item) => item.name === 'Empty Solana') as WalletOption
    const wallet = await solana.connect()
    await expect(wallet.signMessage('x')).rejects.toThrow('returned no signature')
  })

  it('fails the sign-in step when the challenge request is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 400 })),
    )
    const option = (await listWallets()).find((item) => item.family === 'evm') as WalletOption
    const wallet = await option.connect()
    await expect(signAction(wallet, 'POST', '/discovery/resources', {})).rejects.toThrow(
      'Could not start sign-in (400)',
    )
  })
})
