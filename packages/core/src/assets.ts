// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import type { Network } from '@x402/core/types'

import type { ChainFamily } from './schemes.js'

/**
 * One asset on one chain. `asset` is the value that goes into
 * `PaymentRequirements.asset` (a token contract, issuer-qualified code, coin
 * type, or the native symbol). `intentsAssetId` is the 1Click asset id used to
 * request a quote from NEAR Intents.
 *
 * The table is curated, not fetched at runtime. It is the day-one corridor set
 * agreed for v1.0.0 and is validated against the live 1Click catalogue by the
 * `intents` package before a quote is requested.
 */
export interface AssetInfo {
  symbol: string
  network: Network
  family: ChainFamily
  /** On-chain identifier used in x402 requirements. Native assets use their symbol. */
  asset: string
  /** NEAR Intents / 1Click asset id. */
  intentsAssetId: string
  /** 1Click blockchain slug (`arb`, `base`, `sol`, ...). */
  intentsBlockchain: string
  decimals: number
  /** Stablecoins are preferred when a seller has not picked an asset. */
  stablecoin: boolean
}

const A = (
  symbol: string,
  network: Network,
  family: ChainFamily,
  asset: string,
  intentsAssetId: string,
  intentsBlockchain: string,
  decimals: number,
  stablecoin = false,
): AssetInfo => ({
  symbol,
  network,
  family,
  asset,
  intentsAssetId,
  intentsBlockchain,
  decimals,
  stablecoin,
})

const ARB = 'eip155:42161' as const
const BASE = 'eip155:8453' as const
const BERA = 'eip155:80094' as const
const BSC = 'eip155:56' as const
const ETH = 'eip155:1' as const
const OP = 'eip155:10' as const
const PLASMA = 'eip155:9745' as const
const POL = 'eip155:137' as const
const AVAX = 'eip155:43114' as const
const MONAD = 'eip155:143' as const
const XLAYER = 'eip155:196' as const
const SCROLL = 'eip155:534352' as const
const BTC = 'bip122:000000000019d6689c085ae165831e93' as const
const BCH = 'bip122:000000000000000000651ef99cb9fcbe' as const
const LTC = 'bip122:12a765e31ffd4059bada1e25190f6e98' as const
const DASH = 'bip122:00000ffd590b1485b3caadc19b22e637' as const
const ZEC = 'bip122:00040fe8ec8471911baa1db1266ea15d' as const
const DOGE = 'bip122:1a91e3dace36e2be3bf030a65679fe82' as const
const APTOS = 'aptos:1' as const
const NEAR = 'near:mainnet' as const
const SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const
const STELLAR = 'stellar:pubnet' as const
const SUI = 'sui:mainnet' as const
const TON = 'tvm:-239' as const
const XRP = 'xrpl:0' as const
const STARKNET = 'starknet:SN_MAIN' as const

/**
 * Day-one assets, grouped by chain. Stablecoins come first where the user's
 * list includes one, so `preferredAssetForNetwork()` picks a dollar asset
 * without a second lookup table.
 */
export const ASSETS: readonly AssetInfo[] = [
  // Arbitrum
  A(
    'USDC',
    ARB,
    'evm',
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
    'arb',
    6,
    true,
  ),
  A(
    'USDT0',
    ARB,
    'evm',
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    'nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near',
    'arb',
    6,
    true,
  ),
  A(
    'ARB',
    ARB,
    'evm',
    '0x912ce59144191c1204e64559fe8253a0e49e6548',
    'nep141:arb-0x912ce59144191c1204e64559fe8253a0e49e6548.omft.near',
    'arb',
    18,
  ),
  A('ETH', ARB, 'evm', 'ETH', 'nep141:arb.omft.near', 'arb', 18),
  A(
    'WETH',
    ARB,
    'evm',
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    'nep141:arb-0x82af49447d8a07e3bd95bd0d56f35241523fbab1.omft.near',
    'arb',
    18,
  ),

  // Base
  A(
    'USDC',
    BASE,
    'evm',
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
    'base',
    6,
    true,
  ),
  A(
    'sUSDC',
    BASE,
    'evm',
    '0x1c4a802fd6b591bb71daa01d8335e43719048b24',
    'nep141:base-0x1c4a802fd6b591bb71daa01d8335e43719048b24.omft.near',
    'base',
    6,
    true,
  ),
  A('ETH', BASE, 'evm', 'ETH', 'nep141:base.omft.near', 'base', 18),
  A(
    'WETH',
    BASE,
    'evm',
    '0x4200000000000000000000000000000000000006',
    'nep141:base-0x4200000000000000000000000000000000000006.omft.near',
    'base',
    18,
  ),

  // Berachain
  A(
    'USDT0',
    BERA,
    'evm',
    '0x779ded0c9e1022225f8e0630b35a9b54be713736',
    'nep141:bera-0x779ded0c9e1022225f8e0630b35a9b54be713736.omft.near',
    'bera',
    6,
    true,
  ),
  A('BERA', BERA, 'evm', 'BERA', 'nep141:bera.omft.near', 'bera', 18),

  // BNB Chain
  A('BNB', BSC, 'evm', 'BNB', 'nep245:v2_1.omni.hot.tg:56_11111111111111111111', 'bsc', 18),

  // Ethereum
  A(
    'USDC',
    ETH,
    'evm',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
    'eth',
    6,
    true,
  ),
  A(
    'USDT',
    ETH,
    'evm',
    '0xdac17f958d2ee523a2206206994597c13d831ec7',
    'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
    'eth',
    6,
    true,
  ),
  A('ETH', ETH, 'evm', 'ETH', 'nep141:eth.omft.near', 'eth', 18),
  A(
    'WETH',
    ETH,
    'evm',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    'nep141:eth-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.omft.near',
    'eth',
    18,
  ),
  A(
    'WBTC',
    ETH,
    'evm',
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    'nep141:eth-0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.omft.near',
    'eth',
    8,
  ),

  // Optimism
  A(
    'USDC',
    OP,
    'evm',
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
    'nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ',
    'op',
    6,
    true,
  ),
  A(
    'USDT',
    OP,
    'evm',
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
    'nep245:v2_1.omni.hot.tg:10_359RPSJVdTxwTJT9TyGssr2rFoWo',
    'op',
    6,
    true,
  ),
  A(
    'USDT0',
    OP,
    'evm',
    '0x01bff41798a0bcf287b996046ca68b395dbc1071',
    'nep245:v2_1.omni.hot.tg:10_2R1RXDBxCyJTeMEsdXydh7xsHmz',
    'op',
    6,
    true,
  ),
  A(
    'OP',
    OP,
    'evm',
    '0x4200000000000000000000000000000000000042',
    'nep245:v2_1.omni.hot.tg:10_vLAiSt9KfUGKpw5cD3vsSyNYBo7',
    'op',
    18,
  ),
  A('ETH', OP, 'evm', 'ETH', 'nep245:v2_1.omni.hot.tg:10_11111111111111111111', 'op', 18),
  A(
    'WETH',
    OP,
    'evm',
    '0x4200000000000000000000000000000000000006',
    'nep245:v2_1.omni.hot.tg:10_vLAiSt9KfUGKpw5cD3vsSyNYBn5',
    'op',
    18,
  ),

  // Plasma
  A(
    'USDT0',
    PLASMA,
    'evm',
    '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb',
    'nep141:plasma-0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb.omft.near',
    'plasma',
    6,
    true,
  ),
  A('XPL', PLASMA, 'evm', 'XPL', 'nep141:plasma.omft.near', 'plasma', 18),

  // Polygon
  A(
    'USDC',
    POL,
    'evm',
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    'nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L',
    'pol',
    6,
    true,
  ),
  A(
    'USDT',
    POL,
    'evm',
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    'nep245:v2_1.omni.hot.tg:137_3hpYoaLtt8MP1Z2GH1U473DMRKgr',
    'pol',
    6,
    true,
  ),
  A('POL', POL, 'evm', 'POL', 'nep245:v2_1.omni.hot.tg:137_11111111111111111111', 'pol', 18),
  A(
    'WETH',
    POL,
    'evm',
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
    'nep245:v2_1.omni.hot.tg:137_2jwTGwKRX3AEe7tyzDrxtDjEFgSt',
    'pol',
    18,
  ),

  // Avalanche
  A(
    'USDC',
    AVAX,
    'evm',
    '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
    'nep245:v2_1.omni.hot.tg:43114_3atVJH3r5c4GqiSYmg9fECvjc47o',
    'avax',
    6,
    true,
  ),
  A(
    'USDT',
    AVAX,
    'evm',
    '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
    'nep245:v2_1.omni.hot.tg:43114_372BeH7ENZieCaabwkbWkBiTTgXp',
    'avax',
    6,
    true,
  ),
  A('AVAX', AVAX, 'evm', 'AVAX', 'nep245:v2_1.omni.hot.tg:43114_11111111111111111111', 'avax', 18),

  // Monad
  A(
    'USDC',
    MONAD,
    'evm',
    '0x754704bc059f8c67012fed69bc8a327a5aafb603',
    'nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx',
    'monad',
    6,
    true,
  ),
  A(
    'USDT0',
    MONAD,
    'evm',
    '0xe7cd86e13ac4309349f30b3435a9d337750fc82d',
    'nep245:v2_1.omni.hot.tg:143_4EJiJxSALvGoTZbnc8K7Ft9533et',
    'monad',
    6,
    true,
  ),
  A('MON', MONAD, 'evm', 'MON', 'nep245:v2_1.omni.hot.tg:143_11111111111111111111', 'monad', 18),

  // X Layer
  A(
    'USDC',
    XLAYER,
    'evm',
    '0x74b7f16337b8972027f6196a17a631ac6de26d22',
    'nep245:v2_1.omni.hot.tg:196_2dK9kLNR7Ekq7su8FxNGiUW3djTw',
    'xlayer',
    6,
    true,
  ),
  A(
    'USDT0',
    XLAYER,
    'evm',
    '0x779ded0c9e1022225f8e0630b35a9b54be713736',
    'nep245:v2_1.omni.hot.tg:196_2fezDCvVYRsG8wrK6deJ2VRPiAS1',
    'xlayer',
    6,
    true,
  ),
  A('OKB', XLAYER, 'evm', 'OKB', 'nep245:v2_1.omni.hot.tg:196_11111111111111111111', 'xlayer', 18),

  // Scroll. 1Click listed native USDT, not USDT0, at the time of writing.
  A(
    'USDT',
    SCROLL,
    'evm',
    '0xf55bec9cafdbe8730f096aa55dad6d22d44099df',
    'nep245:v2_1.omni.hot.tg:534352_4RG3Q2wFsMQmd45m5m89RjsLfupA',
    'scroll',
    6,
    true,
  ),
  A(
    'ETH',
    SCROLL,
    'evm',
    'ETH',
    'nep245:v2_1.omni.hot.tg:534352_11111111111111111111',
    'scroll',
    18,
  ),

  // UTXO chains
  A('BTC', BTC, 'utxo', 'BTC', 'nep141:btc.omft.near', 'btc', 8),
  A('BCH', BCH, 'utxo', 'BCH', 'nep141:bch.omft.near', 'bch', 8),
  A('LTC', LTC, 'utxo', 'LTC', 'nep141:ltc.omft.near', 'ltc', 8),
  A('DASH', DASH, 'utxo', 'DASH', 'nep141:dash.omft.near', 'dash', 8),
  A('ZEC', ZEC, 'utxo', 'ZEC', 'nep141:zec.omft.near', 'zec', 8),
  A('DOGE', DOGE, 'utxo', 'DOGE', 'nep141:doge.omft.near', 'doge', 8),

  // Aptos
  A(
    'USDC',
    APTOS,
    'aptos',
    '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b',
    'nep141:aptos-34ee497f210c5a511e8d5b53bc56d75b63612bb5.omft.near',
    'aptos',
    6,
    true,
  ),
  A(
    'USDT',
    APTOS,
    'aptos',
    '0x357b0b74bc833e95a115ad22604854d6b0fca151cecd94111770e5d6ffc9dc2b',
    'nep141:aptos-88cb7619440a914fe6400149a12b443c3ac21d59.omft.near',
    'aptos',
    6,
    true,
  ),
  A('APT', APTOS, 'aptos', 'APT', 'nep141:aptos.omft.near', 'aptos', 8),
  A(
    'XRP',
    APTOS,
    'aptos',
    '0x692a35763b3715e910bd7207937d3695c185cde7292f3d89a4d36a907b22dca4',
    '1cs_v1:aptos:aptos-fa:0x692a35763b3715e910bd7207937d3695c185cde7292f3d89a4d36a907b22dca4',
    'aptos',
    6,
  ),
  A(
    'SOL',
    APTOS,
    'aptos',
    '0x0d829a23c3a3760e2fed60ca24d83cee8943f7c61859608ae0726fdb2e4f2784',
    '1cs_v1:aptos:aptos-fa:0x0d829a23c3a3760e2fed60ca24d83cee8943f7c61859608ae0726fdb2e4f2784',
    'aptos',
    8,
  ),
  A(
    'ETH',
    APTOS,
    'aptos',
    '0xb07cf73714a0980fd589e1602ea98fc9c18b8c9c82b828ad3662ee873629be1d',
    '1cs_v1:aptos:aptos-fa:0xb07cf73714a0980fd589e1602ea98fc9c18b8c9c82b828ad3662ee873629be1d',
    'aptos',
    8,
  ),

  // NEAR
  A(
    'USDC',
    NEAR,
    'near',
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    'near',
    6,
    true,
  ),
  A(
    'USDT',
    NEAR,
    'near',
    'usdt.tether-token.near',
    'nep141:usdt.tether-token.near',
    'near',
    6,
    true,
  ),
  A('BTC', NEAR, 'near', 'nbtc.bridge.near', 'nep141:nbtc.bridge.near', 'near', 8),
  A('cNEAR', NEAR, 'near', 'cnear.assetize.near', 'nep141:cnear.assetize.near', 'near', 24),
  A('ETH', NEAR, 'near', 'eth.bridge.near', 'nep141:eth.bridge.near', 'near', 18),
  A('wNEAR', NEAR, 'near', 'wrap.near', 'nep141:wrap.near', 'near', 24),
  A(
    'wBTC',
    NEAR,
    'near',
    '2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near',
    'nep141:2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near',
    'near',
    8,
  ),

  // Solana
  A(
    'USDC',
    SOL,
    'svm',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
    'sol',
    6,
    true,
  ),
  A(
    'USDT',
    SOL,
    'svm',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near',
    'sol',
    6,
    true,
  ),
  A(
    'sUSDC',
    SOL,
    'svm',
    '3tMdx4g4grCgqHjELqALfTPnZnG1BLwsPntD3tGREgvp',
    'nep141:sol-2dc7b64e5dd3c717fc85abaf51cdcd4b18687f09.omft.near',
    'sol',
    6,
    true,
  ),
  A('SOL', SOL, 'svm', 'SOL', 'nep141:sol.omft.near', 'sol', 9),
  A(
    'wNEAR',
    SOL,
    'svm',
    '3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG',
    '1cs_v1:sol:spl:3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG',
    'sol',
    9,
  ),

  // Stellar
  A(
    'USDC',
    STELLAR,
    'stellar',
    'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    'nep245:v2_1.omni.hot.tg:1100_111bzQBB65GxAPAVoxqmMcgYo5oS3txhqs1Uh1cgahKQUeTUq1TJu',
    'stellar',
    7,
    true,
  ),
  A(
    'XLM',
    STELLAR,
    'stellar',
    'XLM',
    'nep245:v2_1.omni.hot.tg:1100_111bzQBB5v7AhLyPMDwS8uJgQV24KaAPXtwyVWu2KXbbfQU6NXRCz',
    'stellar',
    7,
  ),

  // Sui
  A(
    'USDC',
    SUI,
    'sui',
    '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    'nep141:sui-c1b81ecaf27933252d31a963bc5e9458f13c18ce.omft.near',
    'sui',
    6,
    true,
  ),
  A('SUI', SUI, 'sui', '0x2::sui::SUI', 'nep141:sui.omft.near', 'sui', 9),

  // TON
  A(
    'USDT',
    TON,
    'ton',
    'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
    'nep245:v2_1.omni.hot.tg:1117_3tsdfyziyc7EJbP2aULWSKU4toBaAcN4FdTgfm5W1mC4ouR',
    'ton',
    6,
    true,
  ),
  A('GRAM', TON, 'ton', 'GRAM', 'nep245:v2_1.omni.hot.tg:1117_', 'ton', 9),

  // XRP Ledger
  A('XRP', XRP, 'xrpl', 'XRP', 'nep141:xrp.omft.near', 'xrp', 6),

  // Starknet
  A('STRK', STARKNET, 'starknet', 'STRK', 'nep141:starknet.omft.near', 'starknet', 18),
  A(
    'SOL',
    STARKNET,
    'starknet',
    '0x0752c64c8430f1a81a8f87e6252a8853cb9428352d585d90b4151cfe3702dcfe',
    '1cs_v1:starknet:erc20:0x0752c64c8430f1a81a8f87e6252a8853cb9428352d585d90b4151cfe3702dcfe',
    'starknet',
    9,
  ),
  A(
    'XRP',
    STARKNET,
    'starknet',
    '0x07bc19585817a78f2304b2f3b31f954d80e8a1eff6e8d81a84eb5cedb7267728',
    '1cs_v1:starknet:erc20:0x07bc19585817a78f2304b2f3b31f954d80e8a1eff6e8d81a84eb5cedb7267728',
    'starknet',
    6,
  ),
]

const BY_NETWORK: Readonly<Record<string, readonly AssetInfo[]>> = ASSETS.reduce(
  (acc, asset) => {
    const list = acc[asset.network] ?? []
    list.push(asset)
    acc[asset.network] = list
    return acc
  },
  {} as Record<string, AssetInfo[]>,
)

export function assetsForNetwork(network: Network): readonly AssetInfo[] {
  return BY_NETWORK[network] ?? []
}

/** Stablecoin first, then the chain's native or lead asset. */
export function preferredAssetForNetwork(network: Network): AssetInfo | undefined {
  const assets = assetsForNetwork(network)
  return assets.find((asset) => asset.stablecoin) ?? assets[0]
}

export function findAsset(network: Network, symbolOrAsset: string): AssetInfo | undefined {
  const needle = symbolOrAsset.toLowerCase()
  return assetsForNetwork(network).find(
    (asset) => asset.symbol.toLowerCase() === needle || asset.asset.toLowerCase() === needle,
  )
}

export function findAssetByIntentId(intentsAssetId: string): AssetInfo | undefined {
  return ASSETS.find((asset) => asset.intentsAssetId === intentsAssetId)
}

/** All day-one assets for a chain family, across its networks. */
export function assetsForFamily(family: ChainFamily): readonly AssetInfo[] {
  return ASSETS.filter((asset) => asset.family === family)
}
