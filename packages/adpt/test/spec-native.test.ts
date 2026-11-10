// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { X402_VERSION, type PaymentPayload, type PaymentRequirements } from '@x402interop/core'

import {
  checkSuiExactPayload,
  verifyExact as verifySui,
  type SuiExactClient,
} from '../src/sui/exact.js'
import {
  ANY_CALLER,
  checkStarknetExactPayload,
  verifyExact as verifyStarknet,
  type StarknetExactClient,
} from '../src/starknet/exact.js'
import {
  checkLnbtcPayment,
  decodeBolt11Invoice,
  settleExact as settleLnbtc,
  type DecodedBolt11Invoice,
  type ReplayStore,
} from '../src/lightning/exact.js'
import { supportedNetworks, supportedSchemes } from '../src/registry.js'

const NOW_SECONDS = 1_756_800_000

function payload(accepted: PaymentRequirements, body: Record<string, unknown>): PaymentPayload {
  return {
    x402Version: X402_VERSION,
    accepted,
    payload: body,
  }
}

function requirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'sui:mainnet',
    asset: '0x2::sui::SUI',
    amount: '10000000',
    payTo: '0x1eb7c57e3f2bd0fc6cb9dcffd143ea957e4d98f805c358733f76dee0667fe0b1',
    maxTimeoutSeconds: 300,
    extra: {},
    ...overrides,
  }
}

describe('registry', () => {
  it('advertises all twelve interop schemes', () => {
    const schemes = supportedSchemes()
    for (const id of [
      'x402interop-evm',
      'x402interop-svm',
      'x402interop-sui',
      'x402interop-near',
      'x402interop-tvm',
      'x402interop-tron',
      'x402interop-xrpl',
      'x402interop-aptos',
      'x402interop-stellar',
      'x402interop-starknet',
      'x402interop-lightning',
      'x402interop-utxo',
    ]) {
      expect(schemes).toContain(id)
    }
  })

  it('advertises the day-one CAIP-2 networks only', () => {
    const networks = supportedNetworks()
    expect(networks).toContain('eip155:8453')
    expect(networks).toContain('bip122:000000000019d6689c085ae165831e93')
    expect(networks).toContain('lnbtc:000000000019d6689c085ae165831e93')
    expect(networks).toContain('starknet:SN_MAIN')
    expect(networks.some((n) => n === 'solana:mainnet')).toBe(false)
  })
})

describe('exact on Sui (spec-native)', () => {
  const req = requirements()
  const valid = payload(req, {
    signature: '99X8xzbQkOBY3yUnaeCvDs==',
    transaction: 'AAAAIHfhJwS9PD0sxN3fm94BAQD1t9YHfMunVQ8mBRgO5xM6',
  })

  it('passes structurally valid payloads', () => {
    expect(checkSuiExactPayload(valid, req)).toBeNull()
  })

  it('rejects tampered amounts, recipients, and networks', () => {
    expect(
      checkSuiExactPayload(payload({ ...req, amount: '999' }, valid.payload as never), req),
    ).toBe('invalid_exact_sui_payload_amount_mismatch')
    expect(checkSuiExactPayload({ ...valid, accepted: { ...req, payTo: '0x123' } }, req)).toBe(
      'invalid_exact_sui_payload_recipient_mismatch',
    )
    expect(
      checkSuiExactPayload(
        { ...valid, accepted: { ...req, network: 'sui:testnet' } },
        { ...req, network: 'sui:mainnet' },
      ),
    ).toBe('network_mismatch')
    expect(checkSuiExactPayload({ ...valid, accepted: { ...req, scheme: 'upto' } }, req)).toBe(
      'invalid_scheme',
    )
  })

  it('fails closed without a Sui RPC client', async () => {
    const result = await verifySui(valid, req)
    expect(result.isValid).toBe(false)
    expect(result.invalidReason).toBe('unexpected_verify_error')
  })

  it('verifies through an injected client', async () => {
    const client: SuiExactClient = {
      async simulateTransaction() {},
      async executeTransaction() {
        return { digest: '0xtest' }
      },
    }
    const result = await verifySui(valid, req, { client })
    expect(result.isValid).toBe(true)
  })
})

describe('exact on Starknet (spec-native)', () => {
  const token = '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343'
  const payTo = '0x02dd1b492765c064eac4039e3841aa5f382773b598097a40073bd8b48170ab57'
  const from = '0x03f16efeb2ae57f7d8befb03af08a3a370562dde15149c3506ac2038ffa9be24'
  const feePayer = '0x05f2e02acd59f37f1e19da7ea1db6bf31d49e6e5ba66a7f1c2f0e2ba1be36f81'
  const req = requirements({
    network: 'starknet:SN_MAIN',
    asset: token,
    amount: '10000',
    payTo,
    extra: { feePayer },
  })
  const outside = {
    typedData: {
      message: {
        Caller: feePayer,
        Nonce: '0x1',
        'Execute After': '1',
        'Execute Before': String(NOW_SECONDS + 300),
        Calls: [
          {
            To: token,
            Selector: '0x0083afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e',
            Calldata: [payTo, '0x2710', '0x0'],
          },
        ],
      },
    },
    signature: ['0x0721', '0x05fa'],
  }
  const valid = payload(req, { from, outsideExecution: outside })
  const options = { now: NOW_SECONDS * 1000 }

  it('passes the spec sample shape', () => {
    expect(checkStarknetExactPayload(valid, req, options)).toBeNull()
  })

  it('rejects a redirected caller and an any-caller fee payer', () => {
    const redirected = payload(req, {
      from,
      outsideExecution: {
        ...outside,
        typedData: {
          message: { ...outside.typedData.message, Caller: from },
        },
      },
    })
    expect(checkStarknetExactPayload(redirected, req, options)).toBe(
      'invalid_exact_starknet_payload_caller',
    )
    const sentinelReq = { ...req, extra: { feePayer: ANY_CALLER } }
    expect(
      checkStarknetExactPayload(
        payload(sentinelReq, { from, outsideExecution: outside }),
        sentinelReq,
        options,
      ),
    ).toBe('invalid_payment_requirements')
  })

  it('rejects amount and recipient tampering in the typed data', () => {
    const wrongAmount = payload(req, {
      from,
      outsideExecution: {
        ...outside,
        typedData: {
          message: {
            ...outside.typedData.message,
            Calls: [{ ...outside.typedData.message.Calls[0], Calldata: [payTo, '0x1', '0x0'] }],
          },
        },
      },
    })
    expect(checkStarknetExactPayload(wrongAmount, req, options)).toBe(
      'invalid_exact_starknet_payload_amount_mismatch',
    )
    const wrongRecipient = payload(req, {
      from,
      outsideExecution: {
        ...outside,
        typedData: {
          message: {
            ...outside.typedData.message,
            Calls: [{ ...outside.typedData.message.Calls[0], Calldata: [from, '0x2710', '0x0'] }],
          },
        },
      },
    })
    expect(checkStarknetExactPayload(wrongRecipient, req, options)).toBe(
      'invalid_exact_starknet_payload_recipient_mismatch',
    )
  })

  it('enforces the execution time window', () => {
    const expired = payload(req, {
      from,
      outsideExecution: {
        ...outside,
        typedData: {
          message: { ...outside.typedData.message, 'Execute Before': String(NOW_SECONDS + 200) },
        },
      },
    })
    expect(checkStarknetExactPayload(expired, req, options)).toBe('outside_execution_expired')
  })

  it('fails closed without chain client but passes with one', async () => {
    expect((await verifyStarknet(valid, req, options)).invalidReason).toBe(
      'unexpected_verify_error',
    )
    const client: StarknetExactClient = {
      async isValidSignature() {
        return true
      },
      async isNonceUnused() {
        return true
      },
      async balanceOf() {
        return 1_000_000n
      },
      async simulateSettlement() {},
    }
    expect((await verifyStarknet(valid, req, { ...options, client })).isValid).toBe(true)
  })
})

describe('exact on Lightning lnbtc (spec-native)', () => {
  const specInvoice =
    'lnbc250n1pj48ugqpp54y3u9s8ylemsv8l3ewyzzu0klhujvuvmkl6llchq23vy8rzjsf0qsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygshp5p4nz8am4uqj4q8a87z3sk4x6yk4dv2mvel34epw68qqkwy0xcqvqxqzfvcqpjr4rx6ls6j5rpwknuea64evlk7yfx56wmqcer5eerekdsn9tlv6v4ex9mlz5dtm9qapl3svwlqcf7837dmjkru9z9w4h2rvm0md52w2sqxrwu5f'
  const requestHash = '0d6623f775e025501fa7f0a30b54da25aad62b6ccfe35c85da38016711e6c018'
  const payTo = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
  const network = 'lnbtc:000000000019d6689c085ae165831e93'

  function fixturePreimage(): string {
    return 'ab'.repeat(32) // 64 lowercase hex chars
  }
  function fixturePaymentHash(): string {
    return createHash('sha256').update(Buffer.from(fixturePreimage(), 'hex')).digest('hex')
  }

  // "settle time" during the invoice window (createdAt 1,700,000,000, expiry 300).
  const validationTimeMs = 1_700_000_050 * 1000

  function makeDecoder(): { decode(): DecodedBolt11Invoice } {
    return {
      decode(): DecodedBolt11Invoice {
        return {
          currency: 'bc',
          amountMsat: '25000',
          createdAt: 1_700_000_000,
          expiry: 300,
          paymentHash: fixturePaymentHash(),
          descriptionHash: requestHash,
          payee: payTo,
          signatureVerified: true,
        }
      },
    }
  }

  function lnRequirements(): PaymentRequirements {
    return requirements({
      network,
      asset: 'BTC',
      amount: '25000',
      payTo,
      extra: {
        assetTransferMethod: 'bolt11',
        paymentFlow: 'upfront',
        requestHash,
        requestBindingProfile: 'http:1',
        requestBindingParams: { headers: [] },
        invoice: specInvoice,
      },
    })
  }

  it('decodes the spec test invoice structurally', () => {
    const decoded = decodeBolt11Invoice(specInvoice)
    expect(decoded).not.toBeNull()
    expect(decoded?.currency).toBe('bc')
    expect(decoded?.amountMsat).toBe('25000')
    expect(decoded?.paymentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(decoded?.signatureVerified).toBe(false)
  })

  it('settles a valid preimage proof exactly once per payment hash', async () => {
    const req = lnRequirements()
    const valid = payload(req, { preimage: fixturePreimage() })
    const store: ReplayStore & { claims: Set<string> } = {
      claims: new Set(),
      consume(key) {
        if (this.claims.has(key)) return false
        this.claims.add(key)
        return true
      },
    }
    const first = await settleLnbtc(valid, req, {
      decoder: makeDecoder(),
      store,
      now: validationTimeMs,
    })
    expect(first.success).toBe(true)
    expect(first.transaction).toBe(fixturePaymentHash())
    const second = await settleLnbtc(valid, req, {
      decoder: makeDecoder(),
      store,
      now: validationTimeMs,
    })
    expect(second.success).toBe(false)
    expect(second.errorReason).toBe('duplicate_settlement')
  })

  it('rejects a preimage that does not hash to the payment hash', async () => {
    const req = lnRequirements()
    const store: ReplayStore = {
      async consume() {
        return true
      },
    }
    const wrong = payload(req, { preimage: '0'.repeat(64) })
    const result = await settleLnbtc(wrong, req, {
      decoder: makeDecoder(),
      store,
      now: validationTimeMs,
    })
    expect(result.errorReason).toBe('invalid_exact_lnbtc_preimage_hash_mismatch')
  })

  it('fails closed without a signature-verifying decoder', () => {
    const req = lnRequirements()
    const valid = payload(req, { preimage: fixturePreimage() })
    const reason = checkLnbtcPayment(valid, req, null)
    expect(reason).toBe('invalid_exact_lnbtc_invoice_decode_failed')
  })
})
