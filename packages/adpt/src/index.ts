// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

export * from './types.js'
export * from './detect.js'
export * from './registry.js'
export * from './capabilities.js'

export { evmAdapter } from './evm/index.js'
export { svmAdapter } from './svm/index.js'
export { suiAdapter } from './sui/index.js'
export { nearAdapter } from './near/index.js'
export { tonAdapter } from './ton/index.js'
export { tronAdapter } from './tron/index.js'
export { xrplAdapter } from './xrpl/index.js'
export { aptosAdapter } from './aptos/index.js'
export { stellarAdapter } from './stellar/index.js'
export { starknetAdapter } from './starknet/index.js'
export { lightningAdapter } from './lightning/index.js'
export { utxoAdapter } from './utxo/index.js'

export {
  getAdapter,
  getAllAdapters,
  isSupported,
  supportedNetworks,
  supportedSchemes,
  verify,
  settle,
} from './registry.js'
export {
  DEFAULT_SCHEMES,
  INTEROP_SCHEMES,
  SCHEME_MANIFEST,
  UPSTREAM_EXACT,
  UPSTREAM_OPTIONAL_SCHEMES,
  entryForFamily,
  entryForInteropScheme,
  exactSourceFor,
  type ExactSource,
  type SchemeFamilyEntry,
} from './upstream/manifest.js'
export { loadUpstreamExact, type UpstreamExact } from './shared/upstream.js'
export {
  resolveExactFacilitator,
  supportsExact,
  type ExactFacilitator,
} from './upstream/registry.js'
export {
  caipPatternForFamily,
  createInteropClient,
  createInteropFacilitator,
  createInteropServer,
  interopSchemeForFamily,
  type InteropClientSigner,
  type QuoteMint,
  type QuoteMinter,
} from './interop/index.js'
export {
  createExactAdapters,
  type ExactAdapter,
  type ExactRuntimeOptions,
} from './exact/runtime.js'
export { createExactAdaptersFromEnv } from './exact/env.js'
export { createSuiRpcClient } from './sui/rpc.js'
export type { SuiExactClient } from './sui/exact.js'
export type {
  InteropQuote,
  InteropQuoteStore,
} from './shared/store.js'
export { createFileStore, isQuoteValid } from './shared/store.js'
export type {
  InteropVerificationOptions,
  OriginProof,
  OriginProofCheck,
} from './shared/interop-verify.js'
export type { SvmInteropClient, SvmInteropOptions } from './svm/interop.js'
export type { SuiInteropClient, SuiInteropOptions } from './sui/interop.js'
export type { NearInteropClient, NearInteropOptions } from './near/interop.js'
