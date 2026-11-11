// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Browser-extension wallets for marketplace writes. EVM uses EIP-6963 (with the
 * injected `window.ethereum` as a fallback). Sui and Solana use the Wallet
 * Standard. Mobile wallets (WalletConnect) are a follow-up. NEAR is verified
 * on the server but has no browser connector yet.
 *
 * One EVM connection covers every EVM network: the address is the same on each
 * chain and sign-in uses personal_sign, which needs no chain switch.
 *
 * Every write is signed per action. `signAction` fetches a single-use challenge
 * for the exact method, path, and body, and the wallet signs that message.
 */

import { NETWORK_CATALOGUE } from '@x402interop/core'

import { facilitatorUrl } from './facilitator.js'
import { labelForNetwork } from './network-labels.js'

export type WalletFamily = 'evm' | 'sui' | 'solana'

export interface ConnectedWallet {
  id: string
  family: WalletFamily
  address: string
  name: string
  icon?: string
  /** CAIP-2 networks this connection can sign for. */
  networks: string[]
  signMessage(message: string): Promise<string>
}

export interface WalletOption {
  id: string
  family: WalletFamily
  name: string
  icon?: string
  networks: string[]
  connect(): Promise<ConnectedWallet>
}

/** One-line description of what a connection covers, shown under the wallet name. */
export function coverageOf(networks: readonly string[]): string {
  const evm = networks.filter((network) => network.startsWith('eip155:'))
  if (evm.length === networks.length && evm.length > 1) {
    return `Every EVM network we support (${evm.length})`
  }
  return networks.map(labelForNetwork).join(', ')
}

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string }
  provider: Eip1193
}

interface StandardAccount {
  address: string
  chains: readonly string[]
}

interface StandardWallet {
  name: string
  icon: string
  chains: readonly string[]
  features: Record<string, unknown>
  accounts: readonly StandardAccount[]
}

interface StandardRegistry {
  register(...wallets: StandardWallet[]): void
}

const evmProviders = new Map<string, Eip6963Detail>()
const standardWallets = new Map<string, StandardWallet>()
let started = false

function startDiscovery(): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail
    if (detail?.info?.uuid) evmProviders.set(detail.info.uuid, detail)
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  const registry: StandardRegistry = {
    register(...wallets) {
      for (const wallet of wallets) standardWallets.set(wallet.name, wallet)
    },
  }
  window.addEventListener('wallet-standard:register-wallet', (event) => {
    const callback = (event as CustomEvent<(api: StandardRegistry) => void>).detail
    if (typeof callback === 'function') callback(registry)
  })
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: registry }))
}

export function hexOfUtf8(value: string): string {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The exact text the server hashes: empty for no body, otherwise compact JSON. */
export function bodyTextOf(body: unknown): string {
  return body === undefined || body === null || body === '' ? '' : JSON.stringify(body)
}

function evmOptions(): WalletOption[] {
  const networks = [...NETWORK_CATALOGUE.evm]
  return [...evmProviders.values()].map((detail) => ({
    id: `evm:${detail.info.rdns}`,
    family: 'evm' as const,
    name: detail.info.name,
    icon: detail.info.icon,
    networks,
    async connect() {
      const provider = detail.provider
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      const address = accounts[0]
      if (!address) throw new Error('The wallet returned no account')
      return {
        id: `evm:${detail.info.rdns}`,
        family: 'evm' as const,
        address,
        name: detail.info.name,
        icon: detail.info.icon,
        networks,
        signMessage: async (message: string) =>
          (await provider.request({
            method: 'personal_sign',
            params: [hexOfUtf8(message), address],
          })) as string,
      }
    },
  }))
}

function standardOptions(family: 'sui' | 'solana'): WalletOption[] {
  const prefix = `${family}:`
  const signFeature = family === 'sui' ? 'sui:signPersonalMessage' : 'solana:signMessage'
  return [...standardWallets.values()]
    .filter((wallet) => wallet.chains.some((chain) => chain.startsWith(prefix)))
    .filter((wallet) => signFeature in wallet.features)
    .map((wallet) => {
      const networks = wallet.chains.filter((chain) => chain.startsWith(prefix))
      const id = `${family}:${wallet.name}`
      return {
        id,
        family,
        name: wallet.name,
        icon: wallet.icon,
        networks,
        async connect() {
          const connectFeature = wallet.features['standard:connect'] as
            { connect(): Promise<{ accounts: readonly StandardAccount[] }> } | undefined
          if (!connectFeature) throw new Error(`${wallet.name} does not support connect`)
          const { accounts } = await connectFeature.connect()
          const account = accounts.find((item) =>
            item.chains.some((chain) => chain.startsWith(prefix)),
          )
          if (!account) throw new Error(`${wallet.name} has no ${family} account`)
          return {
            id,
            family,
            address: account.address,
            name: wallet.name,
            icon: wallet.icon,
            networks,
            signMessage: async (message: string) => {
              const bytes = new TextEncoder().encode(message)
              if (family === 'sui') {
                const feature = wallet.features[signFeature] as {
                  signPersonalMessage(input: {
                    message: Uint8Array
                    account: StandardAccount
                  }): Promise<{ signature: string }>
                }
                const { signature } = await feature.signPersonalMessage({ message: bytes, account })
                return signature
              }
              const feature = wallet.features[signFeature] as {
                signMessage(input: {
                  message: Uint8Array
                  account: StandardAccount
                }): Promise<readonly { signature: Uint8Array }[]>
              }
              const [output] = await feature.signMessage({ message: bytes, account })
              if (!output) throw new Error(`${wallet.name} returned no signature`)
              return base64Of(output.signature)
            },
          }
        },
      }
    })
}

/** Lists installed extension wallets. Discovery is asynchronous, so it waits briefly. */
export async function listWallets(): Promise<WalletOption[]> {
  startDiscovery()
  await new Promise((resolve) => setTimeout(resolve, 250))
  return [...evmOptions(), ...standardOptions('sui'), ...standardOptions('solana')]
}

/**
 * Signs one marketplace action. The server stores the challenge against this
 * exact method, path, and body, so the same body must be sent afterwards.
 * `chainId` is the CAIP-2 network of the wallet, which the server folds into
 * the CAIP-10 owner id.
 */
export async function signAction(
  wallet: ConnectedWallet,
  method: string,
  path: string,
  body: unknown,
): Promise<string> {
  const bodyHash = await sha256Hex(bodyTextOf(body))
  const chainId = wallet.networks[0]
  const response = await fetch(`${facilitatorUrl()}/auth/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      family: wallet.family,
      address: wallet.address,
      ...(chainId ? { chainId } : {}),
      method,
      path,
      bodyHash,
    }),
  })
  if (!response.ok) {
    throw new Error(`Could not start sign-in (${response.status}). Try connecting again.`)
  }
  const challenge = (await response.json()) as { nonce: string; message: string }
  const signature = await wallet.signMessage(challenge.message)
  return JSON.stringify({ nonce: challenge.nonce, signature })
}

/** CAIP-10 identity the facilitator assigns to a connected wallet, used to filter "my listings". */
export function ownerIdOf(wallet: {
  family: WalletFamily
  address: string
  networks: string[]
}): string {
  const chainId = wallet.networks[0]
  const [namespace, reference] = chainId ? chainId.split(':') : []
  const fallbackNamespace = wallet.family === 'solana' ? 'solana' : wallet.family
  const normalised =
    wallet.family === 'evm' || wallet.family === 'sui'
      ? wallet.address.toLowerCase()
      : wallet.address
  return `${namespace ?? fallbackNamespace}:${reference ?? 'mainnet'}:${normalised}`
}
