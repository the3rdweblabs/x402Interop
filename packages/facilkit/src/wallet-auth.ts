// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Per-action wallet signatures for marketplace writes.
 *
 * Flow: the client asks for a challenge bound to one (method, path, body hash).
 * The server stores it, builds the sign-in message itself, and accepts exactly
 * one signed request for it. The owner is the verified address, never a
 * client-supplied string.
 */

import { createHash, createPublicKey, randomBytes, verify as edVerify } from 'node:crypto'

import { isValidPersonalMessageSignature } from '@mysten/sui/verify'
import { addressNetworkError } from '@x402interop/core'
import { verifyMessage, type Hex } from 'viem'

import type { MarketplaceAuthRequest, WalletSignatureVerifier } from './auth.js'
import { base58Decode } from './base58.js'

export const WALLET_FAMILIES = ['evm', 'sui', 'solana', 'near'] as const
export type WalletFamily = (typeof WALLET_FAMILIES)[number]

const CHALLENGE_TTL_MS = 5 * 60 * 1000
/** NEP-413 tag: 2^31 + 413. */
const NEP413_TAG = 2147484061

export interface WalletChallengeInput {
  family: WalletFamily
  address: string
  /** CAIP-2 network the wallet is on, for example `eip155:8453`. Selects the CAIP-10 reference. */
  chainId?: string
  method: string
  path: string
  /** Hex SHA-256 of the exact JSON body, or of the empty string when there is no body. */
  bodyHash: string
}

export interface IssuedChallenge {
  nonce: string
  message: string
  expiresAt: string
}

interface StoredChallenge extends WalletChallengeInput {
  message: string
  expiresAt: number
}

export interface WalletChallengeStoreOptions {
  /** Public host the wallet shows, for example `marketplace.example.com`. Also the NEP-413 recipient. */
  domain: string
  now?: () => Date
  ttlMs?: number
}

export function bodyHashOf(body: unknown): string {
  const text = body === undefined || body === null || body === '' ? '' : JSON.stringify(body)
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Validates the address shape for a family and returns the CAIP-10 owner id
 * used in listings. `chainReference` is the CAIP-2 reference from the wallet's
 * network (`8453` for `eip155:8453`, `mainnet` for `sui:mainnet`).
 *
 * The result is an identity, not a payout address. Settlement uses the listing's
 * separate `payTo` field.
 */
export function ownerOf(family: WalletFamily, address: string, chainReference: string): string {
  const namespace = CAIP10_NAMESPACE[family]
  const normalised = family === 'evm' || family === 'sui' ? address.toLowerCase() : address
  return `${namespace}:${chainReference}:${normalised}`
}

/** CAIP-2 namespace written into owner ids, keyed by wallet family. */
const CAIP10_NAMESPACE: Readonly<Record<WalletFamily, string>> = {
  evm: 'eip155',
  sui: 'sui',
  solana: 'solana',
  near: 'near',
}

/**
 * Returns the CAIP-2 reference for a wallet family and an optional network.
 * Falls back to the family's default network when the wallet did not report one.
 */
export function chainReferenceFor(family: WalletFamily, network?: string): string {
  if (network) {
    const parts = network.split(':')
    const reference = parts.length > 1 ? parts[1] : undefined
    if (reference) return reference
  }
  return family === 'evm'
    ? '1'
    : family === 'sui'
      ? 'mainnet'
      : family === 'near'
        ? 'mainnet'
        : 'mainnet'
}

/**
 * Checks that `payTo` is a valid address on every network the listing settles
 * on. Returns an error message naming the first offending network, or
 * `undefined` when the address is acceptable.
 *
 * A listing that settles on one network must not carry an address belonging to
 * another; that is how an EVM wallet ends up as the recipient of a Sui transfer.
 */
export function payToNetworkError(networks: readonly string[], payTo: string): string | undefined {
  if (networks.length === 0) return 'A listing needs at least one network'
  for (const network of networks) {
    const problem = addressNetworkError(network, payTo)
    if (problem) return problem
  }
  return undefined
}

function validateAddress(family: WalletFamily, address: string): void {
  const ok =
    family === 'evm'
      ? /^0x[0-9a-fA-F]{40}$/.test(address)
      : family === 'sui'
        ? /^0x[0-9a-fA-F]{64}$/.test(address)
        : family === 'solana'
          ? base58Length(address, 32)
          : nearPublicKey(address).length === 32
  if (!ok) throw new Error(`Invalid ${family} address`)
}

function base58Length(value: string, length: number): boolean {
  try {
    return base58Decode(value).length === length
  } catch {
    return false
  }
}

function nearPublicKey(address: string): Uint8Array {
  if (!address.startsWith('ed25519:')) throw new Error('NEAR addresses are ed25519:<base58 key>')
  return base58Decode(address.slice('ed25519:'.length))
}

function buildMessage(
  domain: string,
  input: WalletChallengeInput,
  nonce: string,
  issuedAt: string,
  expiresAt: string,
): string {
  return [
    `${domain} wants you to sign in to the marketplace.`,
    '',
    `Chain: ${input.family}`,
    ...(input.chainId ? [`Network: ${input.chainId}`] : []),
    `Address: ${input.address}`,
    `Action: ${input.method} ${input.path}`,
    `Body-SHA256: ${input.bodyHash}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expires At: ${expiresAt}`,
  ].join('\n')
}

export class WalletChallengeStore {
  private readonly pending = new Map<string, StoredChallenge>()
  private readonly domain: string
  private readonly now: () => Date
  private readonly ttlMs: number

  constructor(options: WalletChallengeStoreOptions) {
    this.domain = options.domain
    this.now = options.now ?? (() => new Date())
    this.ttlMs = options.ttlMs ?? CHALLENGE_TTL_MS
  }

  issue(input: WalletChallengeInput): IssuedChallenge {
    validateAddress(input.family, input.address)
    this.purge()
    const issuedAt = this.now()
    const expiresAt = new Date(issuedAt.getTime() + this.ttlMs)
    const nonce = randomBytes(32).toString('base64')
    const message = buildMessage(
      this.domain,
      input,
      nonce,
      issuedAt.toISOString(),
      expiresAt.toISOString(),
    )
    this.pending.set(nonce, { ...input, message, expiresAt: expiresAt.getTime() })
    return { nonce, message, expiresAt: expiresAt.toISOString() }
  }

  /** Removes and returns the challenge. A nonce can be taken once, even if verification then fails. */
  take(nonce: string): (StoredChallenge & { domain: string }) | undefined {
    const challenge = this.pending.get(nonce)
    this.pending.delete(nonce)
    if (!challenge || challenge.expiresAt < this.now().getTime()) return undefined
    return { ...challenge, domain: this.domain }
  }

  private purge(): void {
    const at = this.now().getTime()
    for (const [nonce, challenge] of this.pending) {
      if (challenge.expiresAt < at) this.pending.delete(nonce)
    }
  }
}

export function isWalletFamily(value: unknown): value is WalletFamily {
  return typeof value === 'string' && (WALLET_FAMILIES as readonly string[]).includes(value)
}

function ed25519Key(publicKey: Uint8Array) {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKey).toString('base64url') },
    format: 'jwk',
  })
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function borshString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value)
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, bytes.length, true)
  return concatBytes([length, bytes])
}

/** NEP-413 digest: sha256(tag || borsh(message, nonce, recipient, callbackUrl=None)). */
export function nep413Digest(message: string, nonce: Uint8Array, recipient: string): Uint8Array {
  const tag = new Uint8Array(4)
  new DataView(tag.buffer).setUint32(0, NEP413_TAG, true)
  const payload = concatBytes([
    tag,
    borshString(message),
    nonce,
    borshString(recipient),
    Uint8Array.from([0]),
  ])
  return createHash('sha256').update(payload).digest()
}

async function verifyFamilySignature(
  family: WalletFamily,
  address: string,
  message: string,
  nonce: string,
  domain: string,
  signature: string,
): Promise<boolean> {
  try {
    if (family === 'evm') {
      return await verifyMessage({
        address: address as Hex,
        message,
        signature: signature as Hex,
      })
    }
    if (family === 'sui') {
      return await isValidPersonalMessageSignature(new TextEncoder().encode(message), signature, {
        address,
      })
    }
    if (family === 'solana') {
      const sig = Buffer.from(signature, 'base64')
      if (sig.length !== 64) return false
      return edVerify(null, Buffer.from(message, 'utf8'), ed25519Key(base58Decode(address)), sig)
    }
    const nonceBytes = Buffer.from(nonce, 'base64')
    const sig = signature.startsWith('ed25519:')
      ? base58Decode(signature.slice('ed25519:'.length))
      : Buffer.from(signature, 'base64')
    if (sig.length !== 64) return false
    return edVerify(
      null,
      nep413Digest(message, nonceBytes, domain),
      ed25519Key(nearPublicKey(address)),
      sig,
    )
  } catch {
    return false
  }
}

interface SignatureHeader {
  nonce: string
  signature: string
}

function parseSignatureHeader(header: string): SignatureHeader | undefined {
  try {
    const parsed = JSON.parse(header) as Partial<SignatureHeader>
    if (typeof parsed.nonce === 'string' && typeof parsed.signature === 'string') {
      return { nonce: parsed.nonce, signature: parsed.signature }
    }
  } catch {
    return undefined
  }
  return undefined
}

/**
 * Verifies `x-x402interop-signature` headers. The header carries only the nonce
 * and the signature; the address, action, and message come from the stored challenge.
 */
export function createWalletSignatureVerifier(
  store: WalletChallengeStore,
): WalletSignatureVerifier {
  return {
    async verify(request: MarketplaceAuthRequest, header: string) {
      const parsed = parseSignatureHeader(header)
      if (!parsed) return undefined
      const challenge = store.take(parsed.nonce)
      if (!challenge) return undefined
      if (challenge.method !== request.method || challenge.path !== request.path) return undefined
      if (challenge.bodyHash !== bodyHashOf(request.body)) return undefined
      const ok = await verifyFamilySignature(
        challenge.family,
        challenge.address,
        challenge.message,
        parsed.nonce,
        challenge.domain,
        parsed.signature,
      )
      return ok
        ? ownerOf(
            challenge.family,
            challenge.address,
            chainReferenceFor(challenge.family, challenge.chainId),
          )
        : undefined
    },
  }
}
