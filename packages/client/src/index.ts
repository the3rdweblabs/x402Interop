// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

export {
  createInteropClient,
  registerInteropHandlers,
  wrapFetchWithInterop,
  type CreateInteropClientOptions,
  type FetchLike,
  type InteropHttpClient,
  type InteropSigner,
  type WrapFetchWithInteropOptions,
} from './fetch.js'
export {
  decodePaymentRequired,
  enforceHardPriceCap,
  previewPaymentRequirements,
} from './preview.js'
export {
  buildEvmPaymentPayload,
  type EvmPaymentBinding,
  type EvmPaymentParams,
} from './evm-signer.js'
export { sendEvmPayment, type SendPaymentParams } from './evm-payment.js'
export {
  createNearExactClient,
  createStellarExactClient,
  createSuiExactClient,
  createSvmExactClient,
  type ExactClient,
  type ExactClientPayload,
  type NearExactClientOptions,
  type StellarExactClientOptions,
  type SuiExactClientOptions,
  type SvmExactClientOptions,
} from './exact.js'

export * from './buyer.js'
export { createMcpBuyerClient, type McpBuyerClient, type McpToolCallResult } from './mcp-buyer.js'
