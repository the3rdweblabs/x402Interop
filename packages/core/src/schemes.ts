// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

/**
 * Scheme ids are named for the buyer's chain family. TON's id is `tvm`,
 * matching SCHEME_SPEC, while the package directory stays `ton`.
 */
export const SCHEME_IDS = {
  evm: 'x402interop-evm',
  svm: 'x402interop-svm',
  sui: 'x402interop-sui',
  near: 'x402interop-near',
  ton: 'x402interop-tvm',
  tron: 'x402interop-tron',
  xrpl: 'x402interop-xrpl',
  lightning: 'x402interop-lightning',
} as const

export type ChainFamily = keyof typeof SCHEME_IDS
export type SchemeId = (typeof SCHEME_IDS)[ChainFamily]

const SCHEME_ID_LIST = Object.values(SCHEME_IDS)

export function isInteropScheme(scheme: string): scheme is SchemeId {
  return (SCHEME_ID_LIST as readonly string[]).includes(scheme)
}

export function familyForScheme(scheme: string): ChainFamily | undefined {
  const families = Object.keys(SCHEME_IDS) as ChainFamily[]
  return families.find((family) => SCHEME_IDS[family] === scheme)
}
