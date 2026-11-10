// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Decodes a base58 string (Bitcoin/Solana alphabet). Throws on invalid characters. */
export function base58Decode(value: string): Uint8Array {
  let num = 0n
  for (const char of value) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Invalid base58 character')
    num = num * 58n + BigInt(index)
  }
  const bytes: number[] = []
  while (num > 0n) {
    bytes.unshift(Number(num % 256n))
    num /= 256n
  }
  for (const char of value) {
    if (char !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

/** Encodes bytes as base58. Used by tests and by any caller that needs the Solana address form. */
export function base58Encode(bytes: Uint8Array): string {
  let num = 0n
  for (const byte of bytes) num = num * 256n + BigInt(byte)
  let out = ''
  while (num > 0n) {
    out = ALPHABET.charAt(Number(num % 58n)) + out
    num /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    out = `1${out}`
  }
  return out
}
