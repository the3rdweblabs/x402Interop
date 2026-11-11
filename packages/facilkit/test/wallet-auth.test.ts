// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { generateKeyPairSync, sign as edSign } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { base58Decode, base58Encode } from '../src/base58.js'
import { createInteropFacilitator } from '../src/facilitator.js'
import { FileStore } from '../src/store.js'
import { assertFetchTarget, assertPublicHttpUrl, isHttpUrl } from '../src/url-guard.js'
import {
  bodyHashOf,
  nep413Digest,
  ownerOf,
  chainReferenceFor,
  WalletChallengeStore,
  createWalletSignatureVerifier,
} from '../src/wallet-auth.js'
import { parseServiceRecord } from '../src/services.js'

const DOMAIN = 'marketplace.test'
const listing = {
  name: 'Weather',
  description: 'Current weather',
  price: '0.01',
  networks: ['eip155:8453'],
  asset: 'usdc',
  resourceUrl: 'https://example.com/weather',
}

function clock(start = Date.parse('2026-11-05T00:00:00Z')) {
  let at = start
  return {
    now: () => new Date(at),
    advance: (ms: number) => {
      at += ms
    },
  }
}

function facilitatorWith(now = clock()) {
  const dir = mkdtempSync(join(tmpdir(), 'wallet-auth-'))
  return createInteropFacilitator({
    store: new FileStore(join(dir, 'store.json')),
    marketplaceFreeListings: true,
    marketplaceDomain: DOMAIN,
    now: now.now,
  })
}

type Family = 'evm' | 'sui' | 'solana' | 'near'

interface Signer {
  family: Family
  address: string
  sign: (message: string, nonce: string) => Promise<string>
}

async function evmSigner(): Promise<Signer> {
  const account = privateKeyToAccount(generatePrivateKey())
  return {
    family: 'evm',
    address: account.address,
    sign: (message) => account.signMessage({ message }),
  }
}

async function suiSigner(): Promise<Signer> {
  const keypair = Ed25519Keypair.generate()
  return {
    family: 'sui',
    address: keypair.getPublicKey().toSuiAddress(),
    sign: async (message) => {
      const { signature } = await keypair.signPersonalMessage(new TextEncoder().encode(message))
      return signature
    },
  }
}

function solanaSigner(): Signer {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x ?? '', 'base64url')
  return {
    family: 'solana',
    address: base58Encode(raw),
    sign: async (message) =>
      edSign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64'),
  }
}

function nearSigner(): Signer {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x ?? '', 'base64url')
  return {
    family: 'near',
    address: `ed25519:${base58Encode(raw)}`,
    sign: async (message, nonce) =>
      edSign(
        null,
        Buffer.from(nep413Digest(message, Buffer.from(nonce, 'base64'), DOMAIN)),
        privateKey,
      ).toString('base64'),
  }
}

async function challenge(
  facilitator: ReturnType<typeof facilitatorWith>,
  signer: Signer,
  method: string,
  path: string,
  body: unknown,
) {
  const result = await facilitator.routeFacilitator('POST', '/auth/challenge', {
    family: signer.family,
    address: signer.address,
    method,
    path,
    bodyHash: bodyHashOf(body),
  })
  expect(result.status).toBe(200)
  return result.body as { nonce: string; message: string; expiresAt: string }
}

async function signedHeader(
  facilitator: ReturnType<typeof facilitatorWith>,
  signer: Signer,
  method: string,
  path: string,
  body: unknown,
): Promise<string> {
  const issued = await challenge(facilitator, signer, method, path, body)
  const signature = await signer.sign(issued.message, issued.nonce)
  return JSON.stringify({ nonce: issued.nonce, signature })
}

describe('per-action wallet sign-in', () => {
  it.each(['evm', 'sui', 'solana', 'near'] as const)(
    'creates a listing owned by the verified %s address',
    async (family) => {
      const signer = await signer_(family)
      const facilitator = facilitatorWith()
      const header = await signedHeader(
        facilitator,
        signer,
        'POST',
        '/discovery/resources',
        listing,
      )
      const result = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
        'x-x402interop-signature': header,
      })
      expect(result.status).toBe(201)
      expect((result.body as { resource: { owner: string } }).resource.owner).toBe(
        ownerOf(signer.family, signer.address, chainReferenceFor(signer.family)),
      )
    },
  )

  it('rejects a sui:mainnet listing whose payTo is an EVM address', async () => {
    const signer = await evmSigner()
    const facilitator = facilitatorWith()
    const body = {
      ...listing,
      networks: ['sui:mainnet'],
      payTo: signer.address,
    }
    const header = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', body)
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', body, {
      'x-x402interop-signature': header,
    })
    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: 'invalid_pay_to' })
    expect((result.body as { message: string }).message).toContain('sui:mainnet')
  })

  it('accepts a sui:mainnet listing with a valid Sui payTo', async () => {
    const signer = await evmSigner()
    const facilitator = facilitatorWith()
    const payTo = `0x${'a'.repeat(64)}`
    const body = { ...listing, networks: ['sui:mainnet'], payTo }
    const header = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', body)
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', body, {
      'x-x402interop-signature': header,
    })
    expect(result.status).toBe(201)
    expect((result.body as { resource: { payTo: string } }).resource.payTo).toBe(payTo)
  })

  it('accepts an EVM listing with an EVM payTo', async () => {
    const signer = await evmSigner()
    const facilitator = facilitatorWith()
    const body = { ...listing, payTo: signer.address }
    const header = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', body)
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', body, {
      'x-x402interop-signature': header,
    })
    expect(result.status).toBe(201)
    expect((result.body as { resource: { payTo: string } }).resource.payTo).toBe(signer.address)
  })

  it('never falls back to the owner when payTo is absent', async () => {
    const signer = await evmSigner()
    const facilitator = facilitatorWith()
    const header = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', listing)
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': header,
    })
    expect(result.status).toBe(201)
    expect((result.body as { resource: { payTo?: string } }).resource.payTo).toBeUndefined()
  })

  it('rejects a signature from a different wallet', async () => {
    const owner = await evmSigner()
    const intruder = await evmSigner()
    const facilitator = facilitatorWith()
    const issued = await challenge(facilitator, owner, 'POST', '/discovery/resources', listing)
    const signature = await intruder.sign(issued.message, issued.nonce)
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': JSON.stringify({ nonce: issued.nonce, signature }),
    })
    expect(result.status).toBe(401)
  })

  it('burns a nonce on first use so it cannot be replayed', async () => {
    const signer = await evmSigner()
    const facilitator = facilitatorWith()
    const header = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', listing)
    const first = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': header,
    })
    expect(first.status).toBe(201)
    const replay = await facilitator.routeFacilitator(
      'POST',
      '/discovery/resources',
      { ...listing, name: 'Replay', resourceUrl: 'https://example.com/replay' },
      { 'x-x402interop-signature': header },
    )
    expect(replay.status).toBe(401)
  })

  it('binds the signature to one action, path, and body', async () => {
    const signer = await evmSigner()
    const facilitator = facilitatorWith()
    const header = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', listing)
    const tampered = await facilitator.routeFacilitator(
      'POST',
      '/discovery/resources',
      { ...listing, price: '999' },
      { 'x-x402interop-signature': header },
    )
    expect(tampered.status).toBe(401)
    const created = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', listing)
    const made = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': created,
    })
    expect(made.status).toBe(201)
    const fresh = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', listing)
    const wrongPath = await facilitator.routeFacilitator(
      'PATCH',
      '/discovery/resources/weather',
      listing,
      { 'x-x402interop-signature': fresh },
    )
    expect(wrongPath.status).toBe(401)
  })

  it('expires challenges after five minutes', async () => {
    const signer = await evmSigner()
    const time = clock()
    const facilitator = facilitatorWith(time)
    const header = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', listing)
    time.advance(5 * 60 * 1000 + 1)
    const late = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': header,
    })
    expect(late.status).toBe(401)
  })

  it('ignores a client-supplied owner that does not match the signer', async () => {
    const signer = await evmSigner()
    const facilitator = facilitatorWith()
    const body = { ...listing, owner: 'evm:0x0000000000000000000000000000000000000001' }
    const header = await signedHeader(facilitator, signer, 'POST', '/discovery/resources', body)
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', body, {
      'x-x402interop-signature': header,
    })
    expect(result.status).toBe(403)
  })

  it('refuses challenges for unknown families and malformed addresses', async () => {
    const facilitator = facilitatorWith()
    const badFamily = await facilitator.routeFacilitator('POST', '/auth/challenge', {
      family: 'btc',
      address: 'x',
      method: 'POST',
      path: '/discovery/resources',
      bodyHash: 'h',
    })
    expect(badFamily.status).toBe(400)
    const badAddress = await facilitator.routeFacilitator('POST', '/auth/challenge', {
      family: 'evm',
      address: '0x1234',
      method: 'POST',
      path: '/discovery/resources',
      bodyHash: 'h',
    })
    expect(badAddress.status).toBe(400)
  })

  it('rejects a signature header with the wrong field types', async () => {
    const facilitator = facilitatorWith()
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': JSON.stringify({ nonce: 1, signature: 'x' }),
    })
    expect(result.status).toBe(401)
  })

  it('refuses a signature used for a different HTTP method', async () => {
    const store = new WalletChallengeStore({ domain: DOMAIN })
    const verifier = createWalletSignatureVerifier(store)
    const signer = await evmSigner()
    const issued = store.issue({
      family: 'evm',
      address: signer.address,
      method: 'POST',
      path: '/discovery/resources',
      bodyHash: bodyHashOf(listing),
    })
    const signature = await signer.sign(issued.message, issued.nonce)
    const owner = await verifier.verify(
      { method: 'PUT', path: '/discovery/resources', body: listing, headers: {} },
      JSON.stringify({ nonce: issued.nonce, signature }),
    )
    expect(owner).toBeUndefined()
  })

  it('rejects a malformed signature header', async () => {
    const facilitator = facilitatorWith()
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': 'not-json',
    })
    expect(result.status).toBe(401)
  })
})

describe('signature edge cases', () => {
  it('accepts NEAR signatures in the ed25519:<base58> wallet form', async () => {
    const signer = nearSigner()
    const facilitator = facilitatorWith()
    const issued = await challenge(facilitator, signer, 'POST', '/discovery/resources', listing)
    const raw = Buffer.from(await signer.sign(issued.message, issued.nonce), 'base64')
    const signature = `ed25519:${base58Encode(raw)}`
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': JSON.stringify({ nonce: issued.nonce, signature }),
    })
    expect(result.status).toBe(201)
  })

  it('rejects a Solana signature of the wrong length', async () => {
    const signer = solanaSigner()
    const facilitator = facilitatorWith()
    const issued = await challenge(facilitator, signer, 'POST', '/discovery/resources', listing)
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': JSON.stringify({
        nonce: issued.nonce,
        signature: Buffer.from('short').toString('base64'),
      }),
    })
    expect(result.status).toBe(401)
  })

  it('rejects a Sui signature made by a different key', async () => {
    const owner = await suiSigner()
    const intruder = await suiSigner()
    const facilitator = facilitatorWith()
    const issued = await challenge(facilitator, owner, 'POST', '/discovery/resources', listing)
    const signature = await intruder.sign(issued.message, issued.nonce)
    const result = await facilitator.routeFacilitator('POST', '/discovery/resources', listing, {
      'x-x402interop-signature': JSON.stringify({ nonce: issued.nonce, signature }),
    })
    expect(result.status).toBe(401)
  })

  it('refuses malformed addresses for each family', async () => {
    const facilitator = facilitatorWith()
    const cases: Array<[string, string]> = [
      ['sui', '0x1234'],
      ['solana', 'not-base58-0OIl'],
      ['solana', base58Encode(Uint8Array.from([1, 2, 3]))],
      ['near', 'alice.near'],
      ['near', 'ed25519:short'],
    ]
    for (const [family, address] of cases) {
      const result = await facilitator.routeFacilitator('POST', '/auth/challenge', {
        family,
        address,
        method: 'POST',
        path: '/discovery/resources',
        bodyHash: 'h',
      })
      expect(result.status, `${family} ${address}`).toBe(400)
    }
  })
})

describe('wallet primitives', () => {
  it('emits CAIP-10 owners, lowercasing EVM and Sui and keeping Solana case', () => {
    expect(ownerOf('evm', '0xABCDEF0000000000000000000000000000000001', '8453')).toBe(
      'eip155:8453:0xabcdef0000000000000000000000000000000001',
    )
    expect(
      ownerOf(
        'sui',
        '0xABCDEF0000000000000000000000000000000000000000000000000000000001',
        'mainnet',
      ),
    ).toBe('sui:mainnet:0xabcdef0000000000000000000000000000000000000000000000000000000001')
    expect(
      ownerOf(
        'solana',
        'So11111111111111111111111111111111111111112',
        '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      ),
    ).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:So11111111111111111111111111111111111111112')
  })

  it('round-trips base58 and rejects bad characters', () => {
    const bytes = Uint8Array.from([0, 0, 1, 2, 255])
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes)
    expect(() => base58Decode('0OIl')).toThrow('Invalid base58')
  })

  it('computes the NEP-413 digest over the tagged borsh payload', () => {
    const digest = nep413Digest('hi', new Uint8Array(32), 'r')
    expect(digest).toHaveLength(32)
    expect(
      Buffer.from(digest).equals(Buffer.from(nep413Digest('hi', new Uint8Array(32), 'r'))),
    ).toBe(true)
    expect(
      Buffer.from(digest).equals(Buffer.from(nep413Digest('hi', new Uint8Array(32), 's'))),
    ).toBe(false)
  })

  it('drops expired challenges when new ones are issued', () => {
    const time = clock()
    const store = new WalletChallengeStore({ domain: DOMAIN, now: time.now })
    const address = '0x' + '1'.repeat(40)
    const first = store.issue({
      family: 'evm',
      address,
      method: 'POST',
      path: '/x',
      bodyHash: 'h',
    })
    time.advance(5 * 60 * 1000 + 1)
    store.issue({ family: 'evm', address, method: 'POST', path: '/x', bodyHash: 'h' })
    expect(store.take(first.nonce)).toBeUndefined()
  })

  it('returns no owner for a verifier with no open challenge', async () => {
    const store = new WalletChallengeStore({ domain: DOMAIN })
    const verifier = createWalletSignatureVerifier(store)
    const owner = await verifier.verify(
      { method: 'POST', path: '/x', body: {}, headers: {} },
      JSON.stringify({ nonce: 'missing', signature: 'x' }),
    )
    expect(owner).toBeUndefined()
  })
})

describe('URL guards', () => {
  it('accepts public http(s) and refuses private, loopback, and other schemes', () => {
    expect(isHttpUrl('https://api.example.com')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(() => assertPublicHttpUrl('http://127.0.0.1:8080/x')).toThrow('Private')
    expect(() => assertPublicHttpUrl('http://169.254.169.254/latest')).toThrow('Private')
    expect(() => assertPublicHttpUrl('http://10.0.0.5')).toThrow('Private')
    expect(() => assertPublicHttpUrl('http://[::1]/')).toThrow('Private')
    expect(() => assertPublicHttpUrl('http://metadata.internal/')).toThrow('Private')
    expect(() => assertPublicHttpUrl('ftp://example.com')).toThrow('http')
    expect(() => assertPublicHttpUrl('https://example.com/x')).not.toThrow()
    expect(isHttpUrl('not a url')).toBe(false)
  })

  it('covers the private IPv4 and IPv6 ranges and leaves public lookalikes alone', () => {
    const blocked = [
      'http://0.0.0.0/',
      'http://100.64.0.1/',
      'http://172.16.0.1/',
      'http://172.31.255.1/',
      'http://192.168.1.1/',
      'http://224.0.0.1/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
      'http://[::]/',
      'http://[::ffff:127.0.0.1]/',
      'http://example.localhost/',
      'http://service.internal/',
    ]
    for (const url of blocked) expect(() => assertPublicHttpUrl(url), url).toThrow('Private')
    const allowed = [
      'https://172.15.0.1/',
      'https://172.32.0.1/',
      'https://100.128.0.1/',
      'https://[2001:4860::1]/',
    ]
    for (const url of allowed) expect(() => assertPublicHttpUrl(url), url).not.toThrow()
  })

  it('allows private targets only when explicitly enabled', () => {
    expect(() => assertFetchTarget('http://127.0.0.1:9/x', true)).not.toThrow()
    expect(() => assertFetchTarget('http://127.0.0.1:9/x', false)).toThrow('Private')
    expect(() => assertFetchTarget('javascript:alert(1)', true)).toThrow('http')
  })

  it('rejects non-http resource URLs in listing records', () => {
    const base = {
      id: 'a',
      name: 'A',
      description: 'd',
      price: '1',
      networks: ['eip155:8453'],
      asset: 'usdc',
      owner: 'evm:0x1',
    }
    expect(() => parseServiceRecord({ ...base, resourceUrl: 'javascript:alert(1)' })).toThrow()
    expect(() =>
      parseServiceRecord({ ...base, resourceUrl: 'https://example.com/a' }),
    ).not.toThrow()
  })
})

async function signer_(family: Family): Promise<Signer> {
  if (family === 'evm') return evmSigner()
  if (family === 'sui') return suiSigner()
  if (family === 'solana') return solanaSigner()
  return nearSigner()
}
