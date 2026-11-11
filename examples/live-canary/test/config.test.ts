// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { describe, expect, it } from 'vitest'

import { readCanaryConfig, SEND_CONFIRMATION } from '../src/config.js'
import { privateKeyToAccount } from 'viem/accounts'
import { hasTestPrivateKey, testPrivateKeyOrPlaceholder } from '../../../test-key.js'

const BUYER = '0x2222222222222222222222222222222222222222'
const SELLER = `0x${'11'.repeat(32)}`
const TEST_KEY = testPrivateKeyOrPlaceholder()
const HAS_TEST_KEY = hasTestPrivateKey()
const TEST_ADDRESS = privateKeyToAccount(TEST_KEY).address

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    CANARY_ORIGIN_NETWORK: 'base',
    CANARY_DEST_NETWORK: 'sui:mainnet',
    CANARY_AMOUNT: '200000',
    CANARY_ORIGIN_ADDRESS: BUYER,
    CANARY_DEST_ADDRESS: SELLER,
    ...overrides,
  }
}

describe('readCanaryConfig', () => {
  it('defaults to a quote-only run and normalises the network aliases', () => {
    const config = readCanaryConfig(env())
    expect(config.originNetwork).toBe('eip155:8453')
    expect(config.destinationNetwork).toBe('sui:mainnet')
    expect(config.originAsset.symbol).toBe('USDC')
    expect(config.destinationAsset.symbol).toBe('USDC')
    expect(config.send).toBe(false)
    expect(config.wait).toBe(false)
    expect(config.quoteDry).toBe(false)
    expect(config.pollIntervalMs).toBe(10_000)
    expect(config.pollTimeoutMs).toBe(600_000)
    expect(config.oneClickBaseUrl).toBe('https://1click.chaindefuser.com')
  })

  it.skipIf(!HAS_TEST_KEY)('derives the refund address from an EVM test key', () => {
    const config = readCanaryConfig(
      env({
        CANARY_ORIGIN_ADDRESS: undefined,
        CANARY_ORIGIN_PRIVATE_KEY: TEST_KEY,
      }),
    )
    expect(config.originAddress.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
    expect(config.privateKey).toBe(TEST_KEY)
  })

  it('requires an origin address or key', () => {
    expect(() => readCanaryConfig(env({ CANARY_ORIGIN_ADDRESS: undefined }))).toThrow(
      /CANARY_ORIGIN_ADDRESS or CANARY_ORIGIN_PRIVATE_KEY/,
    )
  })

  it.skipIf(!HAS_TEST_KEY)('rejects a key that does not match the configured address', () => {
    expect(() =>
      readCanaryConfig(env({ CANARY_ORIGIN_PRIVATE_KEY: TEST_KEY, CANARY_ORIGIN_ADDRESS: BUYER })),
    ).toThrow(/does not match/)
  })

  it.skipIf(!HAS_TEST_KEY)('rejects an EVM key for a non-EVM origin', () => {
    expect(() =>
      readCanaryConfig(
        env({
          CANARY_ORIGIN_NETWORK: 'sui:mainnet',
          CANARY_ORIGIN_PRIVATE_KEY: TEST_KEY,
          CANARY_ORIGIN_ADDRESS: undefined,
        }),
      ),
    ).toThrow(/is an EVM key/)
  })

  it.skipIf(!HAS_TEST_KEY)('needs the explicit confirmation token before sending', () => {
    expect(() =>
      readCanaryConfig(
        env({
          CANARY_SEND: 'true',
          CANARY_ORIGIN_PRIVATE_KEY: TEST_KEY,
          CANARY_ORIGIN_ADDRESS: TEST_ADDRESS,
        }),
      ),
    ).toThrow(new RegExp(`CANARY_CONFIRM=${SEND_CONFIRMATION}`))
  })

  it.skipIf(!HAS_TEST_KEY)('enables sending with a key and the confirmation token', () => {
    const config = readCanaryConfig(
      env({
        CANARY_SEND: 'true',
        CANARY_CONFIRM: SEND_CONFIRMATION,
        CANARY_ORIGIN_PRIVATE_KEY: TEST_KEY,
        CANARY_ORIGIN_ADDRESS: TEST_ADDRESS,
      }),
    )
    expect(config.send).toBe(true)
    expect(config.wait).toBe(true)
  })

  it.skipIf(!HAS_TEST_KEY)('lets CANARY_WAIT override the send default', () => {
    const config = readCanaryConfig(
      env({
        CANARY_SEND: 'true',
        CANARY_CONFIRM: SEND_CONFIRMATION,
        CANARY_ORIGIN_PRIVATE_KEY: TEST_KEY,
        CANARY_ORIGIN_ADDRESS: TEST_ADDRESS,
        CANARY_WAIT: 'false',
      }),
    )
    expect(config.send).toBe(true)
    expect(config.wait).toBe(false)
  })

  it.skipIf(!HAS_TEST_KEY)('rejects sending without a key or with a dry quote', () => {
    expect(() =>
      readCanaryConfig(env({ CANARY_SEND: 'true', CANARY_CONFIRM: SEND_CONFIRMATION })),
    ).toThrow(/requires CANARY_ORIGIN_PRIVATE_KEY/)
    expect(() =>
      readCanaryConfig(
        env({
          CANARY_SEND: 'true',
          CANARY_CONFIRM: SEND_CONFIRMATION,
          CANARY_ORIGIN_PRIVATE_KEY: TEST_KEY,
          CANARY_ORIGIN_ADDRESS: TEST_ADDRESS,
          CANARY_QUOTE_DRY: 'true',
        }),
      ),
    ).toThrow(/cannot be combined/)
  })

  it('rejects automatic sending for a non-EVM origin', () => {
    expect(() =>
      readCanaryConfig(
        env({
          CANARY_ORIGIN_NETWORK: 'sui:mainnet',
          CANARY_ORIGIN_ADDRESS: SELLER,
          CANARY_SEND: 'true',
          CANARY_CONFIRM: SEND_CONFIRMATION,
        }),
      ),
    ).toThrow(/Automatic sending is implemented for EVM origins only/)
  })

  it('defaults and validates the slippage tolerance', () => {
    expect(readCanaryConfig(env()).slippageBps).toBe(100)
    expect(readCanaryConfig(env({ CANARY_SLIPPAGE_BPS: '250' })).slippageBps).toBe(250)
    expect(() => readCanaryConfig(env({ CANARY_SLIPPAGE_BPS: '-1' }))).toThrow(
      /CANARY_SLIPPAGE_BPS/,
    )
    expect(() => readCanaryConfig(env({ CANARY_SLIPPAGE_BPS: '10001' }))).toThrow(
      /CANARY_SLIPPAGE_BPS/,
    )
  })

  it('validates enums, booleans, integers, and URLs', () => {
    expect(() => readCanaryConfig(env({ CANARY_SWAP_TYPE: 'NOPE' }))).toThrow(/CANARY_SWAP_TYPE/)
    expect(() => readCanaryConfig(env({ CANARY_DEPOSIT_TYPE: 'NOPE' }))).toThrow(
      /CANARY_DEPOSIT_TYPE/,
    )
    expect(() => readCanaryConfig(env({ CANARY_DELIVERY_MODE: 'NOPE' }))).toThrow(
      /CANARY_DELIVERY_MODE/,
    )
    expect(() => readCanaryConfig(env({ CANARY_SEND: 'yes' }))).toThrow(/CANARY_SEND/)
    expect(() => readCanaryConfig(env({ CANARY_POLL_INTERVAL_SECONDS: '0' }))).toThrow(
      /CANARY_POLL_INTERVAL_SECONDS/,
    )
    expect(() => readCanaryConfig(env({ CANARY_ONECLICK_BASE_URL: 'ftp://nope' }))).toThrow(
      /CANARY_ONECLICK_BASE_URL/,
    )
  })

  it('rejects malformed amounts and private keys', () => {
    expect(() => readCanaryConfig(env({ CANARY_AMOUNT: '0.2' }))).toThrow(/CANARY_AMOUNT/)
    expect(() => readCanaryConfig(env({ CANARY_ORIGIN_PRIVATE_KEY: '0xdead' }))).toThrow(/32-byte/)
  })

  it('honours explicit asset symbols and overrides', () => {
    const config = readCanaryConfig(
      env({ CANARY_ORIGIN_ASSET: 'WETH', CANARY_DEST_ASSET: 'USDC' }),
      { wait: true, quoteDry: true },
    )
    expect(config.originAsset.symbol).toBe('WETH')
    expect(config.wait).toBe(true)
    expect(config.quoteDry).toBe(true)
  })
})
