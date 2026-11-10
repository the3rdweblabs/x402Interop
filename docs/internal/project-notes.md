<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Project notes (internal)

**Status:** concept and architecture stage  
**Date compiled:** October 27, 2026  
**Owner:** THE3RDWEBLABS  
**One-liner:** An interoperability layer for the x402 agent-payment economy. A buyer agent pays on the chain it already uses, a seller is paid on the chain it already uses, and agents can discover x402 services across chains. Cross-chain settlement runs on NEAR Intents.

> Reading guide: items marked **(verified)** came from official docs or repos found during research. Items marked **(secondary)** came from news, blogs, or third-party descriptions. Items marked **(hypothesis)** are our own design assumptions that must be tested before being relied on.

## 1. How this started

1. Started from the NEAR developer docs (docs.near.org).
2. Asked what is missing from NEAR Intents for the agentic web, with cross-chain support and any emerging tech needed.
3. Evolved into: an x402 interoperability layer with its own facilitator, per-chain schemes, cross-chain discovery, and a Bitcoin/Lightning payer path.
4. Renamed to **x402interop** (earlier working name: Interopx402).

## 2. Background research

### 2.1 NEAR docs overview (verified)

- Smart contracts in Rust/WASM (community SDKs for JS, Python, Go). Quickstart via `cargo near`.
- Web3 apps scaffolded with `npx create-near-app@latest`.
- About 1.3s deterministic finality, very low fees, automatic sharding.
- Chain Signatures: one NEAR account can control accounts on other chains.
- TEE-backed AI agents / private inference (NEAR AI Cloud).
- Docs publish an `llms.txt` index and a Docs MCP for AI tooling.

## 3. What NEAR Intents is and how the 1Click API works (verified)

NEAR Intents is an intent-based cross-chain settlement system. The 1Click API wraps it in a deposit-and-receive flow, so integrators never talk to solvers directly.

### 3.1 Flow (e.g. Base → Sui)

1. **Quote:** `POST /v0/quote` with origin asset, destination asset, amount, recipient (on destination chain), refund address (on origin chain), deadline, slippage, and swap type.
2. **Deposit address:** the quote returns a single-use deposit address on the origin chain.
3. **Deposit:** the payer sends a normal transfer to that address. Optionally submit the tx hash.
4. **Fill:** market makers (solvers) deliver the destination asset to the recipient.
5. **Status:** poll `GET /v0/status?depositAddress=...` until the swap ends in success, failure, or refund. Failed swaps refund to the refund address.

## Verified facts

- NEAR Intents 1Click: `POST /v0/quote`, a single-use deposit address, then `GET /v0/status`. Asset ids look like `nep141:<chain>-<address>.omft.near`. Confirm the live set with `GET /v0/tokens`. **(verified, as of 27 Oct 2026; the list moves)**
- There is no Intents testnet. Test with small amounts. **(verified)**
- Unauthenticated 1Click use costs about 0.2%. The partner JWT is server-side only. **(verified)**
- A gasless EIP-3009 transfer to a deposit address counts as a valid 1Click deposit. **(hypothesis)**

## Network ids

Canonical CAIP-2: EVM `eip155:<chainId>`, Solana the mainnet genesis id, `sui:mainnet`, `near:mainnet`, `tvm:-239`, `tron:728126428`, `xrpl:0`, `lnbtc:<genesis-prefix>`, `bip122:<genesis-prefix>`, `aptos:1`, `stellar:pubnet`, `starknet:SN_MAIN`. The catalogue lives in `packages/core/src/networks.ts`.

## DECIDED

- Own facilitator, compatible with x402 already deployed. Same-chain payments pass through later. They are not implemented here.
- One scheme family, keyed by the buyer's chain family.
- No facilitator float and no pre-positioned buyer wallets.
- Default path is a deposit address plus a seller-chosen delivery mode.
- Bitcoin is payer-only, via Lightning top-up, not an Intents Lightning feature.
- Licence is split. Published packages, examples, tests, skills, and docs are GPL-3.0-or-later. Hosted apps are AGPL-3.0-or-later. `NOTICE` states the split; each `package.json` names the licence for its tree.
- Workspace root is `x402interop_monorepo`. Packages live at the root, not under `typescript/`.
- Public packages version together from `1.0.0`.

> This file is internal research. Public-facing docs live in `docs/concept`, `docs/guides`, `docs/reference`, and `docs/specs`.

## Mainnet readiness

Planning note, 3 November 2026. No transaction is sent from this note, and no key or fund is required to read it. Status words mean:

- **real** - the code checks or settles something a mainnet caller can rely on.
- **scaffold** - the type, adapter, and tests exist, and a well-formed payment still fails closed.
- **missing** - there is no implementation, no asset row, or no production control.

**MAINNET-GATING** means that corridor must stay off `/supported` until the item is done. Anything else can ship behind the families that already verify.

Addresses below were compared with `packages/core/src/assets.ts` and [Circle's USDC contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses) on 3 November 2026. A match is case-insensitive. Intents asset ids are the curated 1Click ids in that file, not a fresh `GET /v0/tokens` pull. **(verified for Circle USDC; the 1Click list moves)**

`/supported` advertises only `x402interop-evm`. SVM, NEAR, and Sui can verify locally when a node client is supplied, and the hosted facilitator does not supply one, so they stay off that list. The other families are registered and return `not_implemented` (or have no `exact` at all). That advertisement rule is already MAINNET-GATING.

### Shared production 1Click configuration

| Item     | Today                                                                                                                                                                                                                                                                                      | Gating                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| API      | `https://1click.chaindefuser.com`. `ONECLICK_API_KEY` is required for `live`, `sdk`, and `auto`, and is refused in the browser and in tests. Mock and simulator need no key.                                                                                                               | MAINNET-GATING for any live quote                                  |
| Fee      | Unauthenticated use is about 0.2%. The partner JWT is the lower-fee path and stays server-side. **(verified, Oct 2026)** x402Interop charges no application fee and does **not** send `appFees`. The only payment fees are 1Click's swap, withdraw, and refund fees plus origin-chain gas. | not gating; no application fee is charged                          |
| Slippage | `HttpOneClickClient` and `SdkOneClickClient` send `slippageTolerance` of 100 bps when the quote omits `slippageBps`.                                                                                                                                                                       | not gating; set an explicit cap per corridor before advertising it |
| Deadline | `mintQuote` fixes the deadline at 30 minutes.                                                                                                                                                                                                                                              | not gating; 30 minutes is the chain-confirm window already chosen  |
| Refunds  | `refundTo` is the buyer's origin address. 1Click refunds a failed swap there. The facilitator does not custodian the refund.                                                                                                                                                               | MAINNET-GATING to keep `refundTo` equal to the signing address     |
| Status   | Live mode polls `GET /v0/status`. There is no Intents testnet.                                                                                                                                                                                                                             | MAINNET-GATING                                                     |

### Shared security hardening

| Item                   | Today                                                                                                                                                                                                  | Gating                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Nonce and replay store | Settle records the nonce. The PostgreSQL runtime checks the database as well as the in-process set, so a restart does not reopen a consumed nonce. File and memory stores remain the development path. | Addressed for the PostgreSQL runtime; rate limits and key rotation remain |
| Finality and reorgs    | A payment is accepted when 1Click reports `SUCCESS` after the origin proof. The facilitator does not wait on its own confirmation depth or rewind a reorg.                                             | MAINNET-GATING                                                            |
| Amount and decimals    | The signed binding carries `originAmount`. Nothing re-reads token decimals from the chain before settle.                                                                                               | MAINNET-GATING                                                            |
| Rate limits            | No public rate limit on quote, verify, or settle.                                                                                                                                                      | not gating for a single-operator demo; MAINNET-GATING before an open host |
| Key management         | The 1Click JWT and any relayer key stay in server env. The public demo key cannot live-send. Buyer keys are rejected by MCP.                                                                           | MAINNET-GATING                                                            |

### EVM (Base `eip155:8453`, Monad `eip155:143`, and the other ten catalogue chains)

| Item                  | Today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Gating                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| exact                 | Real delegation to `@x402/evm` (`upto`, `auth-capture`, `batch-settlement` are opt-in). The facilitator advertises `x402interop-evm`, not `exact`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | not gating for the interop corridor                                         |
| interop               | Real EIP-712 quote binding in `packages/adpt/src/evm/interop.ts`. Mock and simulator advance a valid proof to `SUCCESS`. Tests cover recovery, mismatch, and expiry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | not gating                                                                  |
| upstream              | `@x402/evm` is a dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | not gating                                                                  |
| tests                 | Unit tests for the binding. No mainnet RPC test. No live settlement in unit tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | not gating                                                                  |
| RPC                   | Missing in-repo. Use viem `fallback`: a paid endpoint (Alchemy, Infura, QuickNode) then the chain's own RPC (`https://mainnet.base.org` for Base, the Monad RPC published by the chain for `eip155:143`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | MAINNET-GATING before any origin receipt is checked on-chain                |
| USDC and other assets | Circle USDC matches on Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, and Monad (`0x754704bc059f8c67012fed69bc8a327a5aafb603`). Monad USDC supports EIP-3009, so a gasless transfer to a 1Click deposit address is the expected Base and Monad payer path. **(verified against Circle, 3 Nov 2026)** **Mismatch:** X Layer `USDC` in `assets.ts` is `0x74b7f16337b8972027f6196a17a631ac6de26d22`. Circle and OKX label that address bridged `USDC_Bridged`. Circle native X Layer USDC is `0xB6CEceAB302E2E4948951eE7843FC24E92933061`. Do not treat the catalogue row as Circle USDC until it is replaced. **Flag:** BNB Chain (`eip155:56`) lists only `BNB`. There is no USDC or USDT row. Plasma lists `USDT0`, not Circle USDC (`0x2d661c89d812261039af9764eceaaee884f5f67f`). | MAINNET-GATING for the X Layer USDC row and for any BNB stablecoin corridor |
| Wallet                | Missing. Use EIP-6963 discovery and `eth_requestAccounts`. Do not add WalletConnect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | MAINNET-GATING for a browser buyer                                          |
| 1Click                | Same shared config. EVM deposit addresses are hex.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | not gating beyond the shared row                                            |
| Security              | EIP-712 binds quote, deposit, amount, nonce, and expiry. Replay is the nonce store. No receipt confirmation depth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | MAINNET-GATING for confirmation depth                                       |
| Failure modes         | Wrong chain id in the typed data, USDT versus USDC decimals (both 6 on the listed stables, 18 on gas tokens), X Layer bridged USDC accepted as Circle USDC, Monad RPC immaturity, reorg after a soft confirmation, deposit address that is not checksum-stable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | -                                                                           |

### Solana (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)

| Item          | Today                                                                                                                                                            | Gating                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| exact         | Real delegation to `@x402/svm`. Not advertised by `/supported`.                                                                                                  | not gating for interop             |
| interop       | Scaffold. `x402interop-svm` fails closed with `not_implemented`.                                                                                                 | MAINNET-GATING                     |
| upstream      | `@x402/svm`.                                                                                                                                                     | not gating                         |
| tests         | Adapter and scheme tests. No mainnet RPC test.                                                                                                                   | not gating                         |
| RPC           | Missing. Use a paid Solana RPC (Helius, Triton) with `https://api.mainnet-beta.solana.com` as the failover.                                                      | MAINNET-GATING                     |
| USDC          | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, 6 decimals. Matches Circle. USDT `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` matches Tether's published mint. | not gating                         |
| Wallet        | Missing. Use the Wallet Standard (`@wallet-standard/app`) via the Solana wallet adapter. No WalletConnect.                                                       | MAINNET-GATING for a browser buyer |
| 1Click        | Five assets, all with intents ids. SOL is 9 decimals.                                                                                                            | not gating                         |
| Security      | No Solana signature check on the interop path. No commitment-level wait (`confirmed` versus `finalized`).                                                        | MAINNET-GATING                     |
| Failure modes | Blockhash expiry, token-account owner mismatch, 9-decimal SOL treated as 6, dropped UDP transactions that 1Click never sees.                                     | -                                  |

### Sui (`sui:mainnet`)

| Item          | Today                                                                                                          | Gating                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| exact         | Spec-native local checks in `packages/adpt/src/sui/exact.ts`. A chain client is required for full settlement.  | not gating until a Sui buyer is advertised |
| interop       | Scaffold. `not_implemented`.                                                                                   | MAINNET-GATING                             |
| upstream      | None. The spec is mirrored under `docs/specs/schemes`.                                                         | not gating                                 |
| tests         | Spec-native unit tests. No mainnet fullnode test.                                                              | not gating                                 |
| RPC           | Missing. Use `https://fullnode.mainnet.sui.io` plus a second provider (Shinami, BlockVision).                  | MAINNET-GATING                             |
| USDC          | `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`, 6 decimals. Matches Circle.  | not gating                                 |
| Wallet        | Missing. Use the Sui Wallet Standard. No WalletConnect.                                                        | MAINNET-GATING for a browser buyer         |
| 1Click        | USDC and SUI (9 decimals) both have intents ids.                                                               | not gating                                 |
| Security      | No Sui signature check on the interop path. No checkpoint finality wait.                                       | MAINNET-GATING                             |
| Failure modes | Coin object version conflicts, wrong `USDC` package (legacy bridged type versus Circle's type), 9-decimal SUI. | -                                          |

### NEAR (`near:mainnet`)

| Item          | Today                                                                                                                                         | Gating                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| exact         | Real delegation to `@x402/near`. Not advertised.                                                                                              | not gating for interop             |
| interop       | Scaffold. `not_implemented`.                                                                                                                  | MAINNET-GATING                     |
| upstream      | `@x402/near`.                                                                                                                                 | not gating                         |
| tests         | Adapter tests only.                                                                                                                           | not gating                         |
| RPC           | Missing. Use `https://rpc.mainnet.near.org` and fail over to FastNear or a paid endpoint.                                                     | MAINNET-GATING                     |
| USDC          | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, 6 decimals. Matches Circle.                                               | not gating                         |
| Wallet        | Missing. Use the NEAR wallet selector with the injected and MyNear wallets. No WalletConnect.                                                 | MAINNET-GATING for a browser buyer |
| 1Click        | Seven assets, all with `nep141:` ids. wNEAR and cNEAR are 24 decimals.                                                                        | not gating                         |
| Security      | No NEP-413 or function-call signature check on the interop path. NEAR finality is fast, but the facilitator still trusts 1Click status alone. | MAINNET-GATING                     |
| Failure modes | Account versus implicit-address mixups, 24-decimal yoctoNEAR, storage staking that makes a transfer fail.                                     | -                                  |

### Aptos (`aptos:1`)

| Item          | Today                                                                                                                                                                               | Gating                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| exact         | Real delegation to `@x402/aptos`. Not advertised.                                                                                                                                   | not gating for interop             |
| interop       | Scaffold. `not_implemented`.                                                                                                                                                        | MAINNET-GATING                     |
| upstream      | `@x402/aptos`.                                                                                                                                                                      | not gating                         |
| tests         | Adapter registration test. No mainnet fullnode test.                                                                                                                                | not gating                         |
| RPC           | Missing. Use `https://fullnode.mainnet.aptoslabs.com/v1` and a second provider.                                                                                                     | MAINNET-GATING                     |
| USDC          | `0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b`, 6 decimals. Matches Circle's fungible-asset address. Bridged lzUSDC is a different asset and is not this row. | not gating                         |
| Wallet        | Missing. Use the Aptos wallet adapter (AIP-62 / Petra, Pontem). No WalletConnect.                                                                                                   | MAINNET-GATING for a browser buyer |
| 1Click        | Six assets. APT is 8 decimals. XRP, SOL, and ETH on Aptos use `1cs_v1:` ids.                                                                                                        | not gating                         |
| Security      | No Aptos signature check on the interop path.                                                                                                                                       | MAINNET-GATING                     |
| Failure modes | Fungible-asset metadata versus legacy coin type, 8-decimal APT, paying lzUSDC into a native-USDC requirement.                                                                       | -                                  |

### Stellar (`stellar:pubnet`)

| Item          | Today                                                                                                                                                                                                                                  | Gating                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| exact         | Real delegation to `@x402/stellar`. Not advertised.                                                                                                                                                                                    | not gating for interop                         |
| interop       | Scaffold. `not_implemented`.                                                                                                                                                                                                           | MAINNET-GATING                                 |
| upstream      | `@x402/stellar`.                                                                                                                                                                                                                       | not gating                                     |
| tests         | Adapter registration test.                                                                                                                                                                                                             | not gating                                     |
| RPC           | Missing. Use Horizon `https://horizon.stellar.org` or a Soroban RPC if the scheme needs it, with a second provider.                                                                                                                    | MAINNET-GATING                                 |
| USDC          | Issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`, 7 decimals. The issuer matches Circle. Circle prints the asset as `USDC-GA5ZSE…`; the catalogue uses `USDC:GA5ZSE…`. The issuer is the same; the separator differs. | not gating if the scheme expects `CODE:ISSUER` |
| Wallet        | Missing. Use the Stellar Wallets Kit (Freighter and other injected wallets). No WalletConnect.                                                                                                                                         | MAINNET-GATING for a browser buyer             |
| 1Click        | USDC and XLM, both 7 decimals, both with `nep245:` ids.                                                                                                                                                                                | not gating                                     |
| Security      | No Stellar signature check on the interop path. No trustline check.                                                                                                                                                                    | MAINNET-GATING                                 |
| Failure modes | Missing USDC trustline, 7-decimal stroops, classic versus Soroban asset id.                                                                                                                                                            | -                                              |

### Starknet (`starknet:SN_MAIN`)

| Item          | Today                                                                                                                                                                                                                                                 | Gating                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| exact         | Spec-native. Local checks are real. Without an injected RPC client, verify fails closed.                                                                                                                                                              | MAINNET-GATING before advertising `exact` |
| interop       | Scaffold. `not_implemented`.                                                                                                                                                                                                                          | MAINNET-GATING                            |
| upstream      | None. Spec is mirrored.                                                                                                                                                                                                                               | not gating                                |
| tests         | Spec-native unit tests. No mainnet RPC test.                                                                                                                                                                                                          | not gating                                |
| RPC           | Missing. Use a Pathfinder or Juno endpoint (Alchemy, Infura, Blast) with a second provider.                                                                                                                                                           | MAINNET-GATING                            |
| USDC          | **Missing.** Circle native USDC is `0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb` (6 decimals). The catalogue has STRK, SOL, and XRP, not USDC. Bridged USDC.e is a different token and must not be substituted. **(verified)** | MAINNET-GATING for a USDC corridor        |
| Wallet        | Missing. Use Starknetkit / get-starknet (Argent, Braavos). No WalletConnect.                                                                                                                                                                          | MAINNET-GATING for a browser buyer        |
| 1Click        | STRK is `nep141:starknet.omft.near` (18 decimals). SOL and XRP use `1cs_v1:` ids.                                                                                                                                                                     | not gating for STRK                       |
| Security      | Spec forbids the any-caller sentinel. No on-chain `is_valid_signature` unless a client is injected.                                                                                                                                                   | MAINNET-GATING                            |
| Failure modes | Felt padding, USDC versus USDC.e, 18-decimal STRK, a quote that outlives the SNIP-9 execute-before window.                                                                                                                                            | -                                         |

### UTXO (Bitcoin, Bitcoin Cash, Litecoin, Dash, Zcash, Dogecoin)

| Item          | Today                                                                                                                                                                            | Gating                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| exact         | Missing on purpose. No official `exact` spec. Interop-only.                                                                                                                      | not gating                         |
| interop       | Scaffold. `x402interop-utxo` fails closed.                                                                                                                                       | MAINNET-GATING                     |
| upstream      | None, and none should be added.                                                                                                                                                  | not gating                         |
| tests         | Adapter registration test.                                                                                                                                                       | not gating                         |
| RPC           | Missing. Bitcoin needs a full node or a private Esplora/Electrum pair. The same pattern for BCH, LTC, DASH, ZEC, and DOGE. Public explorers are not a failover for verification. | MAINNET-GATING                     |
| Assets        | One native coin each, 8 decimals, `nep141:<chain>.omft.near`. No USDC on these chains. No missing decimals.                                                                      | not gating                         |
| Wallet        | Missing. Use each chain's injected wallet (Unisat or Xverse for Bitcoin, and the equivalent for the other five). No WalletConnect.                                               | MAINNET-GATING for a browser buyer |
| 1Click        | Six assets, all with intents ids. Bitcoin is payer-only in the product decision; the catalogue still lists a BTC intents id.                                                     | not gating                         |
| Security      | No script or sighash check. No confirmation count.                                                                                                                               | MAINNET-GATING                     |
| Failure modes | RBF and replace-by-fee double spends, low-fee stuck deposits, BCH address-format confusion, Zcash unified addresses, 8-decimal sats.                                             | -                                  |

### TON (`tvm:-239`)

| Item          | Today                                                                                                                                                                                                                                                                                                  | Gating                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| exact         | Real delegation to `@x402/tvm`. Not advertised.                                                                                                                                                                                                                                                        | not gating for interop             |
| interop       | Scaffold. `not_implemented`.                                                                                                                                                                                                                                                                           | MAINNET-GATING                     |
| upstream      | `@x402/tvm`.                                                                                                                                                                                                                                                                                           | not gating                         |
| tests         | Adapter registration test.                                                                                                                                                                                                                                                                             | not gating                         |
| RPC           | Missing. Use `https://toncenter.com/api/v2/jsonRPC` plus a second provider, with an API key.                                                                                                                                                                                                           | MAINNET-GATING                     |
| USDT          | Jetton master `EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs`, 6 decimals. Matches Tether's published TON USDT. **Flag:** native row is symbol `GRAM` with intents id `nep245:v2_1.omni.hot.tg:1117_` (empty asset suffix). The native coin is TON, 9 decimals. Treat the intents id as incomplete. | MAINNET-GATING for the native row  |
| Wallet        | Missing. Use TonConnect. No WalletConnect.                                                                                                                                                                                                                                                             | MAINNET-GATING for a browser buyer |
| 1Click        | USDT id is present. GRAM id is the incomplete one above.                                                                                                                                                                                                                                               | MAINNET-GATING for native TON      |
| Security      | No TonConnect proof check on the interop path. No logical-time wait.                                                                                                                                                                                                                                   | MAINNET-GATING                     |
| Failure modes | Bounceable versus non-bounceable addresses, jetton wallet versus jetton master, 9-decimal nanoTON, the truncated intents id quoting the wrong asset.                                                                                                                                                   | -                                  |

### TRON (`tron:728126428`)

| Item          | Today                                                                                                                                       | Gating                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| exact         | Missing on purpose. No official spec. Interop-only.                                                                                         | not gating                         |
| interop       | Scaffold. `not_implemented`.                                                                                                                | MAINNET-GATING                     |
| upstream      | None. Do not add `@bankofai/x402-tron`.                                                                                                     | not gating                         |
| tests         | Adapter registration test.                                                                                                                  | not gating                         |
| RPC           | Missing. Use TronGrid `https://api.trongrid.io` with an API key and a second provider.                                                      | MAINNET-GATING                     |
| Assets        | **Missing.** `assets.ts` has no TRON row, so there is no USDT (`TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`, Tether, 6 decimals) and no intents id. | MAINNET-GATING                     |
| Wallet        | Missing. Use the injected TronLink provider. No WalletConnect.                                                                              | MAINNET-GATING for a browser buyer |
| 1Click        | No curated asset. A quote cannot name a TRON asset id.                                                                                      | MAINNET-GATING                     |
| Security      | No TRON signature check. Energy and bandwidth are not modelled.                                                                             | MAINNET-GATING                     |
| Failure modes | Base58 versus hex addresses, a transfer that runs out of energy, USDT versus USDC confusion, missing intents id.                            | -                                  |

### XRP Ledger (`xrpl:0`)

| Item          | Today                                                                                                                                                                                                        | Gating                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| exact         | Real delegation to `@x402/xrpl`. `upto` is opt-in. Not advertised.                                                                                                                                           | not gating for interop             |
| interop       | Scaffold. `not_implemented`.                                                                                                                                                                                 | MAINNET-GATING                     |
| upstream      | `@x402/xrpl`.                                                                                                                                                                                                | not gating                         |
| tests         | Adapter registration test.                                                                                                                                                                                   | not gating                         |
| RPC           | Missing. Use `wss://xrplcluster.com` and `wss://s1.ripple.com` as a failover pair.                                                                                                                           | MAINNET-GATING                     |
| XRP and USDC  | XRP, 6 decimals, intents id `nep141:xrp.omft.near`. **Missing USDC.** Circle's XRPL USDC is currency `5553444300000000000000000000000000000000`, issuer `rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE`. **(verified)** | MAINNET-GATING for a USDC corridor |
| Wallet        | Missing. Use GemWallet, Crossmark, or Xaman's in-page API. No WalletConnect.                                                                                                                                 | MAINNET-GATING for a browser buyer |
| 1Click        | One asset, XRP. Destination tags are not modelled in the asset row.                                                                                                                                          | not gating for native XRP          |
| Security      | No XRPL signature check on the interop path. No validated-ledger wait.                                                                                                                                       | MAINNET-GATING                     |
| Failure modes | Drops versus XRP (6 decimals), missing destination tag on the deposit, a trust line required for USDC that the catalogue does not list.                                                                      | -                                  |

### Lightning (`lnbtc:000000000019d6689c085ae165831e93`)

| Item          | Today                                                                                                                                     | Gating                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| exact         | Spec-native BOLT11 checks in `packages/adpt/src/lightning/exact.ts`. Local checks can succeed. Settlement still needs a node.             | MAINNET-GATING before advertising it                 |
| interop       | Scaffold. `not_implemented`. The product decision is payer-only top-up, not an Intents Lightning feature.                                 | MAINNET-GATING if a Lightning corridor is advertised |
| upstream      | None. The `lnbtc` spec is mirrored.                                                                                                       | not gating                                           |
| tests         | Spec-native unit tests. No node test.                                                                                                     | not gating                                           |
| RPC           | Missing. A production path needs the seller's Lightning node (LND, CLN, or LDK) plus a second watch. There is no public "RPC" equivalent. | MAINNET-GATING                                       |
| Assets        | **Missing.** No `ASSETS` row, so no intents id and no decimals field. Bitcoin itself is the UTXO row (8 decimals).                        | MAINNET-GATING for a top-up that must quote 1Click   |
| Wallet        | Missing. Use WebLN. No WalletConnect.                                                                                                     | MAINNET-GATING for a browser payer                   |
| 1Click        | No Lightning asset id. A BTC payer is meant to top up, then spend another listed asset.                                                   | MAINNET-GATING for the top-up quote                  |
| Security      | No invoice-preimage check against a node. No hold-invoice expiry aligned with the 30-minute quote.                                        | MAINNET-GATING                                       |
| Failure modes | Invoice expiry inside the quote window, amount in msats versus sats, a payer who pays the invoice twice, no Intents route for the top-up. | -                                                    |

### Per-asset appendix

74 assets in `ASSETS`. Every listed row has a `decimals` number. None is missing decimals. Two catalogue networks have no row at all (TRON, Lightning), so they have no intents id to check. One listed id is incomplete.

| Chain        | CAIP-2             | Assets | Intents id                           | Decimals    | Flag                                                 |
| ------------ | ------------------ | ------ | ------------------------------------ | ----------- | ---------------------------------------------------- |
| Base         | `eip155:8453`      | 4      | present                              | present     | USDC matches Circle                                  |
| Arbitrum     | `eip155:42161`     | 5      | present                              | present     | USDC matches Circle                                  |
| Ethereum     | `eip155:1`         | 5      | present                              | present     | USDC matches Circle                                  |
| Optimism     | `eip155:10`        | 6      | present                              | present     | USDC matches Circle                                  |
| Polygon      | `eip155:137`       | 4      | present                              | present     | USDC matches Circle                                  |
| Avalanche    | `eip155:43114`     | 3      | present                              | present     | USDC matches Circle                                  |
| BNB Chain    | `eip155:56`        | 1      | present                              | present     | **no stablecoin listed**; BNB only                   |
| Berachain    | `eip155:80094`     | 2      | present                              | present     | USDT0, not USDC                                      |
| Plasma       | `eip155:9745`      | 2      | present                              | present     | Circle USDC `0x2d661c89…f67f` is absent              |
| Monad        | `eip155:143`       | 3      | present                              | present     | USDC matches Circle and supports EIP-3009            |
| X Layer      | `eip155:196`       | 3      | present                              | present     | **USDC address is bridged, not Circle native**       |
| Scroll       | `eip155:534352`    | 2      | present                              | present     | USDT row; not re-checked against Tether in this note |
| Bitcoin      | `bip122:…19d668…`  | 1      | present                              | 8           | -                                                    |
| Bitcoin Cash | `bip122:…651ef9…`  | 1      | present                              | 8           | -                                                    |
| Litecoin     | `bip122:12a765e3…` | 1      | present                              | 8           | -                                                    |
| Dash         | `bip122:…0ffd59…`  | 1      | present                              | 8           | -                                                    |
| Zcash        | `bip122:00040fe8…` | 1      | present                              | 8           | -                                                    |
| Dogecoin     | `bip122:1a91e3da…` | 1      | present                              | 8           | -                                                    |
| Aptos        | `aptos:1`          | 6      | present                              | present     | USDC matches Circle                                  |
| NEAR         | `near:mainnet`     | 7      | present                              | present     | USDC matches Circle; 24-decimal NEAR assets          |
| Solana       | `solana:5eykt4Us…` | 5      | present                              | present     | USDC matches Circle                                  |
| Stellar      | `stellar:pubnet`   | 2      | present                              | 7           | issuer matches; separator is `:` not Circle's `-`    |
| Sui          | `sui:mainnet`      | 2      | present                              | present     | USDC matches Circle                                  |
| TON          | `tvm:-239`         | 2      | USDT present; **GRAM id incomplete** | 6 and 9     | native symbol is TON, row says GRAM                  |
| TRON         | `tron:728126428`   | 0      | **missing**                          | **missing** | no row                                               |
| XRP Ledger   | `xrpl:0`           | 1      | present                              | 6           | Circle USDC issuer is absent                         |
| Starknet     | `starknet:SN_MAIN` | 3      | present                              | present     | Circle USDC is absent                                |
| Lightning    | `lnbtc:…19d668…`   | 0      | **missing**                          | **missing** | no row                                               |

Family totals: EVM 40, Solana 5, Sui 2, NEAR 7, Aptos 6, Stellar 2, Starknet 3, UTXO 6, TON 2, TRON 0, XRPL 1, Lightning 0. Total 74.

### Build order

1. **Shared foundations.** Live 1Click settlement with the server-side API key, explicit slippage, the 30-minute deadline, and `refundTo`. Then the per-chain wallet framework (EIP-6963, Solana wallet adapter, Sui Wallet Standard, NEAR wallet selector, and the family-specific injected wallets above; no WalletConnect). Then one RPC verification layer with provider failover, confirmation depth, and decimals read from the chain.
2. **EVM.** Keep the EIP-712 path. Fix the X Layer USDC row before that chain is offered. Add receipt confirmation. Base first, then Monad `eip155:143`, then the other EVM networks.
3. **Solana and Sui.** Replace `not_implemented` with a real origin check, then advertise the scheme.
4. **NEAR.** Same origin-check bar, with 24-decimal amounts covered by tests.
5. **Aptos, Stellar, and Starknet.** Aptos and Stellar need origin checks. Starknet also needs the RPC client required by its `exact` verifier, and a decision on adding Circle USDC.
6. **UTXO, TON, TRON, XRPL, and Lightning.** UTXO stays interop-only. TON needs a complete native intents id. TRON and Lightning need asset rows before any quote. XRPL can ship native XRP before USDC. Lightning stays payer-only top-up unless the product decision changes.

## Marketplace UI (GoPlausible mapping)

Reference product: GoPlausible (`facilitator.goplausible.xyz`), reviewed as a feature list only. x402Interop keeps the black, white, and grey marketplace. Another agent owns the visual pages. This section is the map, not the layout.

Payment rule, already decided: a same-chain payment uses plain x402 `exact`. A payment whose buyer and seller chains differ goes through a NEAR Intents 1Click quote. A buyer can pay with no account. Wallet sign-in is optional and is for sellers, agents, and anyone who wants a dashboard.

Any chain can also pay a 1Click deposit address from a wallet the app does not integrate, using a QR code and the deposit address on the pay panel. Native wallets, and no WalletConnect:

| Chain     | Wallet surface                 |
| --------- | ------------------------------ |
| EVM       | EIP-6963                       |
| Solana    | Wallet Standard                |
| Sui       | dapp-kit                       |
| NEAR      | Wallet Selector                |
| Aptos     | AIP-62                         |
| Starknet  | get-starknet (Argent, Braavos) |
| TON       | TON Connect                    |
| Bitcoin   | Sats Connect                   |
| Lightning | WebLN                          |

### What GoPlausible shows, and the x402Interop view

| GoPlausible                                                                                                              | x402Interop view                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home with mainnet-only totals: volume, settled payments, merchants, providers, payment methods                           | Explorer overview. Totals default to mainnet. Testnet is a filter, never the headline.                                                                                          |
| A card per network                                                                                                       | Explorer networks. One card per catalogue network, with scheme (`exact` or `x402interop-*`) and whether `/supported` currently advertises it.                                   |
| Endpoint list                                                                                                            | Service catalogue, fed by facilitator discovery.                                                                                                                                |
| Live health banner                                                                                                       | Doctor summary on the overview, plus the existing listing health check.                                                                                                         |
| Leaderboards: merchants, payers, resources, assets, networks, countries, sponsors, ranked by volume and settlement count | Explorer leaderboards. Same tabs. One filter bar: mainnet or testnet, source tag, chain, currency, time range.                                                                  |
| Listing created from the first settled payment                                                                           | Keep explicit seller listing. Also record a shadow listing when the first payment settles for an unknown resource, so the catalogue is not empty before the wizard is finished. |
| Refresh a listing                                                                                                        | Seller dashboard action. Re-reads the endpoint and updates health, schema, and price if the seller confirms.                                                                    |
| 402 Doctor                                                                                                               | Doctor page. Fetches the endpoint, expects `402`, and reports scheme, network, asset, amount, and whether the requirement is same-chain `exact` or an interop quote.            |
| Shareable receipts                                                                                                       | Receipt page. One link per settled payment.                                                                                                                                     |
| Transaction flow diagrams                                                                                                | On the receipt and on the route view. Same-chain is one leg. Cross-chain is quote, deposit, swap, delivery.                                                                     |
| AI agent over the data                                                                                                   | Docs and Explorer assistant. It may answer only from facilitator data. Catalogue text stays untrusted.                                                                          |
| Campaign tags                                                                                                            | Optional tag on a listing and on a payment. Filter on the leaderboard.                                                                                                          |
| MCP server                                                                                                               | Already on the facilitator (`/mcp`). The marketplace links to it. It does not grow a second server.                                                                             |
| `llms.txt` and `.well-known/x402`                                                                                        | Docs site serves `llms.txt`. The facilitator should serve `/.well-known/x402` and `/llms.txt` once the API gaps below exist.                                                    |

### What we add

GoPlausible is same-chain. These views are ours:

- **Routes.** An origin-to-destination heatmap and a table of fill time, refund rate, and fee. This is the cross-chain picture.
- **Pay panel on each service.** A live quote for the connected chain, or a chain the buyer picks. Same chain shows an `exact` requirement. A different chain shows the 1Click deposit address, amount, expiry, and a QR code.
- **Two-leg receipts.** Origin transaction and destination transaction, plus quote id, refund address, and fee lines.
- **Optional accounts.** Wallet sign-in for sellers and agents. Buyers stay signed-out unless they want history.

### Sitemap

All of this stays in the black, white, and grey design. The other UI agent draws it.

| Area      | Pages                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| Explorer  | Overview, routes, networks, leaderboards, funnels                                                  |
| Catalogue | Service list, service detail with the pay panel                                                    |
| Sell      | Five steps: connect wallet, create agent, list service, pricing, chains. Then the seller dashboard |
| Use       | Buyer dashboard and agent dashboard. Both optional                                                 |
| Operate   | API keys, Doctor, receipts, docs                                                                   |

### Facilitator API gaps

The marketplace cannot build the explorer or the pay panel from the routes that exist today.

| Gap                             | Why it is needed                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytics                       | Home totals, funnels, heatmap, leaderboards                                                                                                         |
| `payments` and `events` tables  | Receipts, rankings, and the shadow listing                                                                                                          |
| Accounts                        | Optional wallet sign-in per chain                                                                                                                   |
| Agents                          | The seller wizard's agent step                                                                                                                      |
| API key management              | Seller and agent keys, not only env `X402INTEROP_API_KEYS`                                                                                          |
| Receipts                        | Shareable two-leg receipts                                                                                                                          |
| `/openapi.json` and `/llms.txt` | Public API description for agents                                                                                                                   |
| `/supported` lists `exact`      | It currently advertises `x402interop-evm` only. Same-chain `exact` has to appear per network or the catalogue cannot tell a buyer which path to use |

### Fees

x402Interop does not charge an application fee on cross-chain payments. The owner still chooses whether to take a 1Click partner key for the lower upstream fee schedule.

| Path               | Fee                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Cross-chain quote  | No x402Interop application fee. 1Click's swap, withdraw, and refund fees apply upstream. |
| Featured placement | Paid. Already sketched as a marketplace fee option.                                      |
| Same-chain payment | Free.                                                                                    |
| Listing            | Free.                                                                                    |
| Seller Pro         | Later. Not in this cut.                                                                  |
