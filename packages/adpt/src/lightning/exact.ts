// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Spec-native `exact` on Bitcoin Lightning (`lnbtc`), built from
 * `docs/specs/schemes/exact/scheme_exact_lnbtc.md` (mirrored upstream).
 *
 * Payment is `upfront` over BOLT11: the payer proves payment with the 32-byte
 * preimage, and the facilitator verifies `SHA-256(preimage) == payment_hash`
 * locally - no Lightning node access. Everything here runs offline except the
 * BOLT11 **signature** check, which requires secp256k1 recovery, so a real
 * invoice decoder/verifier is injected; without one the scheme fails closed.
 */

import { createHash } from 'node:crypto'

import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402interop/core'

export const LN_NETWORKS = {
  'lnbtc:000000000019d6689c085ae165831e93': 'bc',
  'lnbtc:000000000933ea01ad0ee984209779ba': 'tb',
} as const

export interface DecodedBolt11Invoice {
  /** `bc` or `tb`. */
  currency: string
  /** Integral millisatoshis (bigint-safe via string). */
  amountMsat: string
  /** Unix creation timestamp. */
  createdAt: number
  /** BOLT11 expiry in seconds. */
  expiry: number
  /** `p` field: 64 lowercase hex characters. */
  paymentHash: string
  /** `h` field: 64 lowercase hex characters, when present. */
  descriptionHash?: string
  /** `n` field: 66 lowercase hex characters, when present. */
  payee?: string
  /** True only when a real verifier confirmed the invoice signature. */
  signatureVerified: boolean
}

export interface InvoiceDecoder {
  decode(invoice: string): DecodedBolt11Invoice | null
}

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const CHARSET_REV: Record<string, number> = {}
for (let i = 0; i < CHARSET.length; i++) CHARSET_REV[CHARSET[i]] = i

const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

function polymod(values: number[]): number {
  let chk = 1
  for (const value of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i++) chk ^= (top >> i) & 1 ? GEN[i] : 0
  }
  return chk
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5)
  out.push(0)
  for (const c of hrp) out.push(c.charCodeAt(0) & 31)
  return out
}

/** 5-bit groups → bytes. The final BOLT11 group carries padding; clamp it. */
function convertBits5to8(data: number[], pad: boolean): number[] {
  const out: number[] = []
  let acc = 0
  let bits = 0
  for (const value of data) {
    // bits never exceeds 12; mask so repeated shifts cannot lose precision.
    const mask = (1 << (bits + 5)) - 1
    acc = (((acc << 5) | value) & mask) >>> 0
    bits += 5
    while (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  if (pad && bits > 0) out.push((acc << (8 - bits)) & 0xff)
  return out
}

const MULTIPLIERS: Record<string, bigint> = {
  m: 100_000_000n, // milliBTC → msat
  u: 100_000n,
  n: 100n,
  p: 1n,
}

function parseAmount(hrp: string): { currency: string; amountMsat: string } | null {
  const match = /^ln(bc|tb|tbs|bcrt)(.*)$/.exec(hrp.toLowerCase())
  if (!match) return null
  const currency = match[1] === 'bc' || match[1] === 'bcrt' ? 'bc' : 'tb'
  const rest = match[2]
  const multiplierMatch = /(\d+)([munp]?)$/.exec(rest)
  if (!multiplierMatch) return null
  const units = BigInt(multiplierMatch[1])
  const multiplier = MULTIPLIERS[multiplierMatch[2]] ?? 100_000_000_000n
  return { currency, amountMsat: (units * multiplier).toString() }
}

/**
 * Minimal BOLT11 field extraction. Signature validation is deliberately NOT
 * implemented (no secp256k1 dependency): `signatureVerified` is always false,
 * so callers must use it for structural tests only and wire a real verifier
 * for production.
 */
export function decodeBolt11Invoice(invoice: string): DecodedBolt11Invoice | null {
  const sep = invoice.lastIndexOf('1')
  if (sep < 3) return null
  const hrp = invoice.slice(0, sep).toLowerCase()
  const data = invoice.slice(sep + 1)

  for (const c of data) if (!(c in CHARSET_REV)) return null
  const values = Array.from(data, (c) => CHARSET_REV[c])
  if (polymod([...hrpExpand(hrp), ...values]) !== 1) return null

  const amount = parseAmount(hrp)
  if (!amount) return null

  // The Data Part is: 35-bit timestamp (7 base32 chars), tagged fields, then
  // the 520-bit signature (104 groups). Parse the tags straight from the
  // 5-bit groups; each field body is bit-packed so it is converted on its own.
  if (values.length < 7 + 3 + 104) return null
  const timestamp = values.slice(0, 7).reduce((acc, g) => acc * 32 + g, 0)

  const fields: Record<string, string> = {}
  let i = 7
  while (i < values.length) {
    // The signature (104 groups) carries no tag; stop before parsing it.
    if (values.length - i === 104) break
    const tagType = values[i]
    // BOLT11 `data_length` counts 5-bit groups, not bytes: `p` = 52 groups
    // = 32 bytes + 4 zero bits.
    const groupCount = (values[i + 1] ?? 0) * 32 + (values[i + 2] ?? 0)
    i += 3
    const fieldBytes = convertBits5to8(values.slice(i, i + groupCount), false)
    const field = fieldBytes.map((b) => b.toString(16).padStart(2, '0')).join('')
    if (tagType === 1)
      fields.paymentHash = field // p
    else if (tagType === 23)
      fields.descriptionHash = field // h
    else if (tagType === 6) fields.expiry = String(parseInt(field, 16) || 3600)
    else if (tagType === 19) fields.payee = field // n
    i += groupCount
  }

  return {
    currency: amount.currency,
    amountMsat: amount.amountMsat,
    createdAt: timestamp,
    expiry: Number(fields.expiry ?? 3600),
    paymentHash: fields.paymentHash ?? '',
    descriptionHash: fields.descriptionHash,
    payee: fields.payee,
    signatureVerified: false,
  }
}

export function isValidCompressedPubkey(value: string): boolean {
  return /^[0-9a-f]{66}$/.test(value) && (value.startsWith('02') || value.startsWith('03'))
}

export function isValidPreimage(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}

/**
 * Stable reasons per the spec's error vocabulary. Missing fields fail rather
 * than disabling the dependent check.
 */
export function checkLnbtcPayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  invoice: DecodedBolt11Invoice | null,
): string | null {
  const accepted = payload.accepted
  if (accepted.scheme !== 'exact' || requirements.scheme !== 'exact') return 'unsupported_scheme'
  if (!(accepted.network in LN_NETWORKS)) return 'unsupported_network'
  if (accepted.network !== requirements.network) return 'network_mismatch'
  if (accepted.asset !== 'BTC' || requirements.asset !== 'BTC') return 'invalid_exact_lnbtc_asset'
  if (accepted.amount !== requirements.amount) return 'invalid_exact_lnbtc_amount_mismatch'
  if (!/^\d+$/.test(requirements.amount) || BigInt(requirements.amount) === 0n) {
    return 'invalid_exact_lnbtc_amount'
  }
  if (accepted.payTo !== requirements.payTo) return 'invalid_exact_lnbtc_pay_to_mismatch'
  if (!isValidCompressedPubkey(requirements.payTo)) return 'invalid_exact_lnbtc_pay_to_malformed'
  if (accepted.maxTimeoutSeconds !== requirements.maxTimeoutSeconds) {
    return 'invalid_exact_lnbtc_max_timeout_mismatch'
  }
  if (!Number.isInteger(requirements.maxTimeoutSeconds) || requirements.maxTimeoutSeconds <= 0) {
    return 'invalid_exact_lnbtc_max_timeout'
  }
  const method = accepted.extra?.assetTransferMethod ?? 'bolt11'
  if (method !== 'bolt11') return 'invalid_exact_lnbtc_asset_transfer_method'
  if (accepted.extra?.paymentFlow !== 'upfront' || requirements.extra?.paymentFlow !== 'upfront') {
    return 'invalid_exact_lnbtc_payment_flow'
  }
  const requirementHash = requirements.extra?.requestHash
  const acceptedHash = accepted.extra?.requestHash
  if (
    typeof requirementHash !== 'string' ||
    typeof acceptedHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(requirementHash) ||
    !/^[0-9a-f]{64}$/.test(acceptedHash)
  ) {
    return 'invalid_exact_lnbtc_request_binding'
  }
  const profile = requirements.extra?.requestBindingProfile
  if (profile !== 'http:1' && profile !== 'mcp:1') return 'invalid_exact_lnbtc_request_binding'
  if (accepted.extra?.requestBindingProfile !== profile)
    return 'invalid_exact_lnbtc_request_binding'
  if (requirementHash !== acceptedHash) return 'invalid_exact_lnbtc_request_mismatch'

  const requirementInvoice = requirements.extra?.invoice
  if (typeof requirementInvoice !== 'string' || requirementInvoice.length === 0) {
    return 'invalid_exact_lnbtc_invoice_missing'
  }
  const acceptedInvoice = accepted.extra?.invoice
  if (typeof acceptedInvoice !== 'string' || acceptedInvoice.length === 0) {
    return 'invalid_exact_lnbtc_invoice_missing'
  }
  if (!invoice) return 'invalid_exact_lnbtc_invoice_decode_failed'
  if (!invoice.signatureVerified) return 'invalid_exact_lnbtc_invoice_decode_failed'
  if (invoice.currency !== LN_NETWORKS[accepted.network as keyof typeof LN_NETWORKS]) {
    return 'invalid_exact_lnbtc_invoice_currency_mismatch'
  }
  if (invoice.amountMsat !== requirements.amount) {
    return 'invalid_exact_lnbtc_invoice_amount_mismatch'
  }
  if (invoice.expiry !== requirements.maxTimeoutSeconds) {
    return 'invalid_exact_lnbtc_invoice_expiry_mismatch'
  }
  if (!/^[0-9a-f]{64}$/.test(invoice.paymentHash))
    return 'invalid_exact_lnbtc_invoice_decode_failed'
  if (invoice.descriptionHash !== requirementHash) {
    return 'invalid_exact_lnbtc_invoice_request_mismatch'
  }
  if (invoice.payee && invoice.payee !== requirements.payTo) {
    return 'invalid_exact_lnbtc_invoice_payee_mismatch'
  }

  const preimage = (payload.payload as { preimage?: unknown } | undefined)?.preimage
  if (typeof preimage !== 'string') return 'invalid_exact_lnbtc_preimage_missing'
  if (!isValidPreimage(preimage)) return 'invalid_exact_lnbtc_preimage_malformed'
  const digest = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex')
  if (digest !== invoice.paymentHash) return 'invalid_exact_lnbtc_preimage_hash_mismatch'

  return null
}

export interface ReplayStore {
  /** Atomically claim a consumption key; false when already consumed. */
  consume(key: string): boolean | Promise<boolean>
}

export interface LnExactOptions {
  decoder?: InvoiceDecoder
  store?: ReplayStore
  now?: number
  skew?: number
}

const defaultStore: ReplayStore = {
  consume(key: string) {
    const store =
      (defaultStore as unknown as { claimed?: Set<string> }).claimed ?? new Set<string>()
    ;(defaultStore as unknown as { claimed: Set<string> }).claimed = store
    if (store.has(key)) return false
    store.add(key)
    return true
  },
}

export async function settleExact(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: LnExactOptions = {},
): Promise<SettleResponse> {
  const decoder = options.decoder
  const acceptedInvoice = payload.accepted.extra?.invoice
  const invoice =
    typeof acceptedInvoice === 'string' && decoder ? decoder.decode(acceptedInvoice) : null
  const reason = checkLnbtcPayment(payload, requirements, invoice)
  if (reason) {
    return {
      success: false,
      errorReason: reason,
      transaction: '',
      network: requirements.network,
    }
  }

  // checkLnbtcPayment returns invoice_decode_failed on a null invoice, so the
  // reason check above guarantees `invoice` here; keep the null guard cheap
  // for the type system only.
  if (!invoice) {
    return {
      success: false,
      errorReason: 'invalid_exact_lnbtc_invoice_decode_failed',
      transaction: '',
      network: requirements.network,
    }
  }
  // Paid-but-expired window: invoice_end + skew.
  const skew = options.skew ?? 60
  const now = Math.floor((options.now ?? Date.now()) / 1000)
  if (now > invoice.createdAt + invoice.expiry + skew) {
    return {
      success: false,
      errorReason: 'invalid_exact_lnbtc_invoice_expired',
      transaction: '',
      network: requirements.network,
    }
  }

  const claimKey = `${requirements.network}:${invoice.paymentHash}`
  const store = options.store ?? defaultStore
  if (!(await store.consume(claimKey))) {
    return {
      success: false,
      errorReason: 'duplicate_settlement',
      transaction: '',
      network: requirements.network,
    }
  }

  return { success: true, transaction: invoice.paymentHash, network: requirements.network }
}

/**
 * The `upfront` flow never calls facilitator `/verify`; adapter `verify` is
 * kept for interface completeness and runs the same local checks without
 * replay consumption.
 */
export async function verifyExact(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  options: LnExactOptions = {},
): Promise<VerifyResponse> {
  const decoder = options.decoder
  const acceptedInvoice = payload.accepted.extra?.invoice
  const invoice =
    typeof acceptedInvoice === 'string' && decoder ? decoder.decode(acceptedInvoice) : null
  const reason = checkLnbtcPayment(payload, requirements, invoice)
  if (reason) return { isValid: false, invalidReason: reason }
  return { isValid: true }
}
