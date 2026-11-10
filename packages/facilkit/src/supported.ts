// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  SCHEME_IDS,
  X402_VERSION,
  networksForFamily,
  type ChainFamily,
  type SupportedKind,
} from '@x402interop/core'

/**
 * Families `/supported` may advertise.
 *
 * EVM interop recovers an EIP-712 quote binding with no injected client.
 * SVM, NEAR, and Sui can verify when the caller passes a node client, and
 * the hosted facilitator does not construct those clients, so they stay
 * off this list. Every other interop family is registered and fails closed
 * (`not_implemented`). `/supported` omits them so a client does not treat
 * a fail-closed scheme as payable.
 */
const VERIFIED_INTEROP_FAMILIES: readonly ChainFamily[] = ['evm']

export function supportedKinds(): SupportedKind[] {
  const kinds: SupportedKind[] = []
  for (const family of VERIFIED_INTEROP_FAMILIES) {
    for (const network of networksForFamily(family)) {
      kinds.push({
        x402Version: X402_VERSION,
        scheme: SCHEME_IDS[family],
        network,
      })
    }
  }
  return kinds
}
