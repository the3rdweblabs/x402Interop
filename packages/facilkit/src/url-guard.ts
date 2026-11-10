// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Guards for URLs the facilitator fetches on a listing's behalf. Only literal
 * hosts are checked here. DNS names that resolve to private addresses are not
 * caught (hypothesis: a resolver-level block is still needed in production).
 */

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return false
  const [a = 0, b = 0] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return true
  if (host.includes(':')) {
    return (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe8') ||
      host.startsWith('fe9') ||
      host.startsWith('fea') ||
      host.startsWith('feb') ||
      host.startsWith('::ffff:')
    )
  }
  return isPrivateIPv4(host)
}

/** Throws unless the URL is http(s) and does not point at a literal private or loopback host. */
export function assertPublicHttpUrl(value: string): void {
  if (!isHttpUrl(value)) throw new Error('Only http(s) URLs can be fetched')
  if (isPrivateHost(new URL(value).hostname)) {
    throw new Error('Private and loopback addresses cannot be fetched')
  }
}

/** `assertPublicHttpUrl` unless the operator has explicitly allowed private targets. */
export function assertFetchTarget(value: string, allowPrivate: boolean): void {
  if (allowPrivate) {
    if (!isHttpUrl(value)) throw new Error('Only http(s) URLs can be fetched')
    return
  }
  assertPublicHttpUrl(value)
}
