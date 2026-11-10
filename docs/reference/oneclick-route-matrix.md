<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# 1Click route matrix

Tested against the live 1Click API on **5 November 2026** with `dry: true` quotes. No funds moved.

## Direct-to-merchant destinations

A merchant receives on its own chain only when the quote uses `recipientType: DESTINATION_CHAIN`. `recipientType: INTENTS` credits an account inside NEAR Intents instead; the merchant must withdraw before the funds are in its on-chain wallet. x402Interop always uses `DESTINATION_CHAIN`, so every seller is paid at its final address.

| Destination                                                                          | Address format         | Status                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------- |
| Sui                                                                                  | `0x` + 64 hex          | Confirmed                                                                           |
| Base                                                                                 | `0x` + 40 hex          | Confirmed                                                                           |
| Solana                                                                               | base58                 | Confirmed                                                                           |
| Aptos                                                                                | `0x` + 64 hex          | Confirmed                                                                           |
| Ethereum, Arbitrum, Optimism, Polygon, Avalanche, Berachain, Plasma, X Layer, Scroll | `0x` + 40 hex          | Confirmed from Sui, Base, and Solana; EVM-to-EVM pairs were not exhaustively tested |
| BNB Chain                                                                            | `0x` + 40 hex          | Confirmed at $1,001+ on 5 November 2026; temporary minimum applies                  |
| Stellar                                                                              | `G...`, 56 characters  | Not confirmed; requires a USDC trustline on the merchant account                    |
| NEAR                                                                                 | `.near` or 64-char hex | Quoted directly to an existing account; `INTENTS` also available                    |

The working origins at the $5 test size are Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, Berachain, Plasma, X Layer, Scroll, Solana, Sui, and Aptos. BNB Chain quotes above its temporary minimum (see below). NEAR, Stellar, and Monad are not working origins.

For x402Interop, `DESTINATION_CHAIN` is used for every seller network, including `near:mainnet`. The merchant receives at its final address; x402Interop never substitutes an Intents balance for the merchant's wallet.

## Method

- Pulled `GET /v0/tokens`.
- Selected one stablecoin per chain, preferring USDC, then USDT, then USDT0.
- Used a $5 notional quote for the matrix; BSC was retested at $1,000, $1,000.01, $1,001, $1,500, $2,000, and $5,000.
- BSC used USDT `nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g` (18 decimals). Other BSC tokens use the same `nep245:v2_1.omni.hot.tg:56_...` form.
- Destination `recipientType` is `DESTINATION_CHAIN` for every seller, including NEAR.
- Addresses were format-valid test addresses. Stellar used the USDC issuer account, which has no USDC trustline.
- 135 origin/destination pairs were tested across Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BNB Chain, Berachain, Plasma, Monad, X Layer, Scroll, Solana, Sui, NEAR, Stellar, and Aptos.

## Working destination groups

### To Sui

Works from Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, Berachain, Plasma, X Layer, Scroll, Solana, Sui, and Aptos. BNB Chain quotes above its temporary minimum (see below).

### To Base

Works from Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, Berachain, Plasma, X Layer, Scroll, Solana, Sui, and Aptos. BNB Chain quotes above its temporary minimum (see below).

### To Solana

Works from Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, Berachain, Plasma, X Layer, Scroll, Solana, Sui, and Aptos. BNB Chain quotes above its temporary minimum (see below).

### To NEAR

Works from Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BNB Chain, Berachain, Plasma, X Layer, Scroll, Solana, Sui, and Aptos, subject to BNB Chain's temporary minimum.

Re-tested on 5 November 2026: both `recipientType: DESTINATION_CHAIN` and `recipientType: INTENTS` now quote for an existing `.near` account:

- named account, e.g. `the3rdweblabs.near`
- 64-character implicit account

A 0.2 USDC Base → NEAR quote to `the3rdweblabs.near` returned `amountIn: 0.206643`, `amountOut: 0.2`, `withdrawFee: 0.004603` with `DESTINATION_CHAIN`, and `amountIn: 0.202039`, `withdrawFee: 0` with `INTENTS`. The direct route pays the withdrawal fee upfront; the Intents route defers it until the merchant withdraws.

A nonexistent `.near` account returned `Internal server error`, so the destination account must exist. The direct route still needs a micro settlement to confirm the on-chain `ft_transfer`; treat that as the remaining verification step.

### To Aptos

Works from Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, Berachain, Plasma, X Layer, Scroll, Solana, Sui, and Aptos. BNB Chain quotes above its temporary minimum (see below).

### To the other EVM chains

Sui, Base, and Solana quoted successfully to Ethereum, Arbitrum, Optimism, Polygon, Avalanche, Berachain, Plasma, X Layer, and Scroll. Those EVM-to-EVM pairs were not exhaustively tested.

## Known failures and limits

- **NEAR as origin:** all tested NEAR origins returned `Quoting for this pair is not available` or `Internal server error`, including NEAR USDC, `wrap.near`, named accounts, implicit accounts, and `depositType: INTENTS`. 1Click currently quotes NEAR as a destination, not as an origin.
- **Monad:** all tested Monad routes returned `Internal server error`.
- **Stellar as destination:** requires the recipient account to hold a USDC trustline; the test issuer account did not.
- **Stellar as origin:** returned `Incorrect depositMode for originAsset from stellar chain` with `ORIGIN_CHAIN`. It is not currently usable through this path.
- **BNB Chain:** 1Click applies a temporary corridor minimum. On 5 November 2026 the advertised minimum was $1,000, but the effective floor was just above it; see the table below. The threshold has moved between test runs (earlier testing needed $2,000), so do not hardcode it. The x402 catalogue still lists only BNB native on `eip155:56`, so a BSC stablecoin is not a supported seller asset until a catalogue row is added.
- **NEAR destination:** `recipientType: DESTINATION_CHAIN` now quotes for an existing `.near` account. x402Interop uses that route exclusively; a micro settlement is still pending to confirm the on-chain `ft_transfer`.
- **Sui → NEAR:** direct `DESTINATION_CHAIN` now quotes. The recipient account must exist.

### BNB Chain minimum

`POST /v0/quote` returns `Temporary swap limits: minimum swap amount is $1,000` below the corridor floor. Tested on 5 November 2026 with `swapType: EXACT_INPUT` and `recipientType: DESTINATION_CHAIN`:

| Input     | BNB USDT → Base USDC | Base USDC → BNB USDT |
| --------- | -------------------- | -------------------- |
| $1,000    | 400                  | 400                  |
| $1,000.01 | 400                  | 400                  |
| $1,001    | 201                  | 201                  |
| $1,500    | 201                  | 201                  |
| $2,000    | 201                  | 201                  |
| $5,000    | 201                  | 201                  |

The advertised boundary is not inclusive: $1,000 failed in both directions, while $1,001 quoted. The limit is USD-denominated, not token units, so leave a buffer above the advertised minimum. The limit is set by 1Click, not by BNB Chain, and it has moved between test runs; earlier testing needed $2,000. Re-test rather than hardcoding a threshold.

1Click routing changes over time. Re-run the matrix before relying on a corridor in production.

See [1Click swap lifecycle](/reference/oneclick-swap-lifecycle) for the quote, deposit, status, and refund sequence behind these routes.
