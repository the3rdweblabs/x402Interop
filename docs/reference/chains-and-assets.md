<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Chain & asset coverage

Source of truth for the chains and assets x402Interop v1.0.0 supports on day one, confirmed against the NEAR Intents (1Click) documentation and catalogue (`https://1click.chaindefuser.com/v0/tokens`, fetched 2026-10-31).

The machine-readable version lives in `@x402interop/core`:

- `packages/core/src/networks.ts` - `NETWORK_CATALOGUE` (CAIP-2 ids)
- `packages/core/src/assets.ts` - `ASSETS` (symbol, on-chain id, 1Click asset id, decimals, stability)

Keep the two in sync: docs describe, code ships.

## Principles

1. **Stablecoins preferred.** Where a chain offers a dollar asset, it is listed first and becomes the default asset for that chain.
2. **Mainnet only.** NEAR Intents has no testnet, so the catalogue contains only mainnet ids. Testnets can be passed explicitly via `familyNetworks`.
3. **CAIP-2 everywhere.** Every network id is a CAIP-2 id.
4. **No invented `exact` schemes.** A chain with no official `exact` spec is interop-only.

## Network matrix (26 chains)

### EVM chains

| Chain              | CAIP-2 id       | Day-one assets (stablecoins first)   |
| ------------------ | --------------- | ------------------------------------ |
| Base **(default)** | `eip155:8453`   | **USDC**, sUSDC, ETH, WETH           |
| Arbitrum One       | `eip155:42161`  | **USDC**, USDT0, ARB, ETH, WETH      |
| Ethereum           | `eip155:1`      | **USDC**, USDT, ETH, WETH, WBTC      |
| Optimism           | `eip155:10`     | **USDC**, USDT, USDT0, OP, ETH, WETH |
| Polygon            | `eip155:137`    | **USDC**, USDT, POL, WETH            |
| Avalanche C-Chain  | `eip155:43114`  | **USDC**, USDT, AVAX                 |
| BNB Smart Chain    | `eip155:56`     | BNB                                  |
| Berachain          | `eip155:80094`  | **USDT0**, BERA                      |
| Plasma             | `eip155:9745`   | **USDT0**, XPL                       |
| Monad              | `eip155:143`    | **USDC**, USDT0, MON                 |
| X Layer            | `eip155:196`    | **USDC**, USDT0, OKB                 |
| Scroll             | `eip155:534352` | **USDT**, ETH                        |

> **BNB Chain catalogue gap:** the x402 catalogue lists only BNB native on `eip155:56`. 1Click quotes BSC stablecoin corridors with `nep245:v2_1.omni.hot.tg:56_...` asset ids, but those rows are not in this catalogue, so a BSC stablecoin is not a supported seller asset yet. BNB corridors also have a temporary minimum swap amount; see the [1Click route matrix](/reference/oneclick-route-matrix).

### UTXO chains

| Chain        | BIP-122 reference                         | Asset |
| ------------ | ----------------------------------------- | ----- |
| Bitcoin      | `bip122:000000000019d6689c085ae165831e93` | BTC   |
| Bitcoin Cash | `bip122:000000000000000000651ef99cb9fcbe` | BCH   |
| Litecoin     | `bip122:12a765e31ffd4059bada1e25190f6e98` | LTC   |
| Dash         | `bip122:00000ffd590b1485b3caadc19b22e637` | DASH  |
| Zcash        | `bip122:00040fe8ec8471911baa1db1266ea15d` | ZEC   |
| Dogecoin     | `bip122:1a91e3dace36e2be3bf030a65679fe82` | DOGE  |

### Other L1s

| Chain      | CAIP-2 id                                 | Family / schemes                                             | Day-one assets                               |
| ---------- | ----------------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Aptos      | `aptos:1`                                 | `aptos`; `exact` + `x402interop-aptos`                       | **USDC**, USDT, APT, XRP, SOL, ETH           |
| NEAR       | `near:mainnet`                            | `near`; `exact` + `x402interop-near`                         | **USDC**, USDT, BTC, cNEAR, ETH, wNEAR, wBTC |
| Solana     | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `svm`; `exact` + `x402interop-svm`                           | **USDC**, USDT, sUSDC, SOL, wNEAR            |
| Stellar    | `stellar:pubnet`                          | `stellar`; `exact` + `x402interop-stellar`                   | **USDC**, XLM                                |
| Sui        | `sui:mainnet`                             | `sui`; `exact` (spec-native) + `x402interop-sui`             | **USDC**, SUI                                |
| TON        | `tvm:-239`                                | `ton`; `exact` + `x402interop-tvm`                           | **USDT**, GRAM                               |
| TRON       | `tron:728126428`                          | `tron`; `x402interop-tron` only                              | (interop deposit only)                       |
| XRP Ledger | `xrpl:0`                                  | `xrpl`; `exact` + `x402interop-xrpl`                         | XRP                                          |
| Starknet   | `starknet:SN_MAIN`                        | `starknet`; `exact` (spec-native) + `x402interop-starknet`   | STRK, SOL, XRP                               |
| Lightning  | `lnbtc:000000000019d6689c085ae165831e93`  | `lightning`; `exact` (spec-native) + `x402interop-lightning` | BTC (BOLT11)                                 |

## Scheme implementation sources

| Scheme                                              | Carried by                                        | Rule                                                           |
| --------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| `exact` - EVM, SVM, NEAR, TON, XRPL, Aptos, Stellar | upstream `@x402/*` packages                       | adopt upstream, never rewrite                                  |
| `exact` - Sui, Starknet, Lightning                  | official specs (mirrored in `docs/specs/schemes`) | implement **spec-native** in `adpt`; no third-party package    |
| `x402interop-*` - all 12 families                   | `@x402interop/adpt`                               | our interop scheme per family                                  |
| `upto`, `auth-capture`, `batch-settlement`          | upstream                                          | opt-in, not part of the default set                            |
| TRON, UTXO `exact`                                  | -                                                 | no official spec exists → interop-only, no third-party package |

## NEAR Intents transport

`@x402interop/intents` drives the quote lifecycle through NEAR Intents and supports **two interchangeable transports**:

1. **REST API** - direct `https://one.click/api/v0/...` HTTP calls (`HttpOneClickClient`). Zero new dependencies.
2. **Official SDK** - `@defuse-protocol/one-click-sdk-typescript` (`SdkOneClickClient`) with the REST client as fallback. The SDK is an opt-in dependency resolved lazily.

Both expose the same `OneClickClient` interface; a transport is chosen at factory time and can be swapped (or fail over) without touching callers.
