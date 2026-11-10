// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { findAsset } from '@x402interop/core'
import type { DeliveryMode, Network } from '@x402interop/core'

import type { ResourceConfig } from './config.js'

export interface ProtectedResource {
  id: string
  title: string
  description: string
  path: string
  sellerNetwork: Network
  sellerAsset: string
  sellerAssetId: string
  sellerAssetSymbol: string
  sellerAssetDecimals: number
  sellerAddress: string
  amount: string
  deliveryMode: DeliveryMode
  content: Record<string, unknown>
}

function requiredAsset(network: Network, symbol: string) {
  const asset = findAsset(network, symbol)
  if (!asset) throw new Error(`Asset ${symbol} not found for ${network}`)
  return asset
}

export function buildCatalog(config: ResourceConfig): ProtectedResource[] {
  const sui = requiredAsset('sui:mainnet' as Network, 'USDC')
  const near = requiredAsset('near:mainnet' as Network, 'USDC')
  return [
    {
      id: 'sui-usdc-report',
      title: 'Sui settlement report',
      description: 'A protected report; seller accepts Sui USDC via cross-chain x402Interop.',
      path: '/r/sui-usdc-report',
      sellerNetwork: sui.network,
      sellerAsset: sui.asset,
      sellerAssetId: sui.intentsAssetId,
      sellerAssetSymbol: sui.symbol,
      sellerAssetDecimals: sui.decimals,
      sellerAddress: config.SUI_SELLER_ADDRESS,
      amount: config.SUI_USDC_AMOUNT,
      deliveryMode: 'on_success',
      content: {
        report: 'sui-usdc-report',
        destination: 'sui:mainnet USDC',
        message: 'Access granted after cross-chain settlement.',
      },
    },
    {
      id: 'near-usdc-report',
      title: 'NEAR settlement report',
      description: 'A protected report; seller accepts NEAR USDC via cross-chain x402Interop.',
      path: '/r/near-usdc-report',
      sellerNetwork: near.network,
      sellerAsset: near.asset,
      sellerAssetId: near.intentsAssetId,
      sellerAssetSymbol: near.symbol,
      sellerAssetDecimals: near.decimals,
      sellerAddress: config.NEAR_SELLER_ADDRESS,
      amount: config.NEAR_USDC_AMOUNT,
      deliveryMode: 'on_success',
      content: {
        report: 'near-usdc-report',
        destination: 'near:mainnet USDC',
        message: 'Access granted after cross-chain settlement.',
      },
    },
  ]
}

function formatUnits(atomic: string, decimals: number): string {
  const neg = atomic.startsWith('-')
  const s = neg ? atomic.slice(1) : atomic
  const pad = s.padStart(decimals + 1, '0')
  const whole = pad.slice(0, -decimals)
  const frac = pad.slice(-decimals).replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`
}

export function catalogView(resources: ProtectedResource[], baseUrl: string) {
  return {
    service: 'x402interop-example-resource',
    note: 'Each resource returns HTTP 402 with a live/simulated x402Interop quote. Pay from one origin wallet and retry with PAYMENT-SIGNATURE.',
    resources: resources.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      url: `${baseUrl}${r.path}`,
      sellerNetwork: r.sellerNetwork,
      sellerAsset: r.sellerAsset,
      sellerAssetId: r.sellerAssetId,
      sellerAssetSymbol: r.sellerAssetSymbol,
      price: `${formatUnits(r.amount, r.sellerAssetDecimals)} ${r.sellerAssetSymbol}`,
      amountAtomic: r.amount,
      decimals: r.sellerAssetDecimals,
      deliveryMode: r.deliveryMode,
    })),
  }
}
