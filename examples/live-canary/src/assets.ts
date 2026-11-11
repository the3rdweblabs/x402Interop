// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import {
  ASSETS,
  assetsForNetwork,
  findAsset,
  findAssetByIntentId,
  preferredAssetForNetwork,
  type AssetInfo,
  type Network,
} from '@x402interop/core'

/** One catalogue asset resolved for a specific network. */
export interface CanaryAsset {
  network: Network
  symbol: string
  family: AssetInfo['family']
  /** On-chain identifier used in x402 `PaymentRequirements.asset`. */
  asset: string
  /** NEAR Intents 1Click asset id used in the quote request. */
  intentsAssetId: string
  decimals: number
}

/**
 * Resolve `SYMBOL`, on-chain asset id, or 1Click asset id against the curated
 * catalogue. An empty input picks the preferred stablecoin for the network.
 */
export function resolveCanaryAsset(network: Network, input?: string): CanaryAsset {
  const value = input?.trim()
  const info = value
    ? (findAsset(network, value) ?? findAssetByIntentId(value))
    : preferredAssetForNetwork(network)

  if (!info) {
    const symbols = assetsForNetwork(network).map((asset) => asset.symbol)
    if (symbols.length === 0) {
      throw new Error(
        `No catalogue assets for ${network}. Add the corridor to packages/core/src/assets.ts first.`,
      )
    }
    throw new Error(
      `Unknown asset "${value ?? ''}" on ${network}. Known symbols: ${symbols.join(', ')}`,
    )
  }

  if (info.network !== network) {
    throw new Error(
      `Asset ${info.symbol} belongs to ${info.network}, not ${network}. Use the chain that holds it.`,
    )
  }

  return {
    network,
    symbol: info.symbol,
    family: info.family,
    asset: info.asset,
    intentsAssetId: info.intentsAssetId,
    decimals: info.decimals,
  }
}

/** Human-readable catalogue for `--list-assets`. */
export function listCatalogue(): string[] {
  return ASSETS.map(
    (asset) =>
      `${asset.network.padEnd(46)} ${asset.symbol.padEnd(10)} ${String(asset.decimals).padStart(2)}  ${asset.intentsAssetId}`,
  )
}
