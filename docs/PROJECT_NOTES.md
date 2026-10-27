<!--
provenance: "native"
copyright: "2026 The3rdWebLabs"
-->

# x402interop — Project Notes (A to Z)

**Status:** concept and architecture stage  
**Date compiled:** October 27, 2026  
**Owner:** The3rdWebLabs  
**One-liner:** An interoperability layer for the x402 agent-payment economy. A buyer agent pays on the chain it already uses, a seller is paid on the chain it already uses, and agents can discover x402 services across chains. Cross-chain settlement runs on NEAR Intents.

> Reading guide: items marked **(verified)** came from official docs or repos found during research. Items marked **(secondary)** came from news, blogs, or third-party descriptions. Items marked **(hypothesis)** are our own design assumptions that must be tested before being relied on.

---

## 1. How this started

1. Started from the NEAR developer docs (docs.near.org).
2. Asked about the NEAR hackathon starting November 1.
3. Asked what is missing from NEAR Intents for the agentic web, with cross-chain support and any emerging tech needed.
4. Evolved into: an x402 interoperability layer with its own facilitator, per-chain schemes, cross-chain discovery, and a Bitcoin/Lightning payer path.
5. Renamed to **x402interop** (earlier working name: Interopx402).

---

## 2. Background research

### 2.1 NEAR docs overview (verified)

- Smart contracts in Rust/WASM (community SDKs for JS, Python, Go). Quickstart via `cargo near`.
- Web3 apps scaffolded with `npx create-near-app@latest`.
- About 1.3s deterministic finality, very low fees, automatic sharding.
- Chain Signatures: one NEAR account can control accounts on other chains.
- TEE-backed AI agents / private inference (NEAR AI Cloud).
- Docs publish an `llms.txt` index and a Docs MCP for AI tooling.

### 2.2 NEAR hackathon (secondary — confirm on official channels)

- Dates: November 1–14, 2026. Judging November 16–18. Results by November 18, 23:59 UTC.
- Prize pool: about $250,000 across 13 tracks (AI agents, autonomous payments, cross-chain apps, DeFi, private AI, autonomous businesses, agent economies, real-world payments, gaming, social finance, and others).
- Entry: no signup; public repo plus demo.
- Highlighted tech: NEAR Intents, NEAR AI Cloud.
- Judges mentioned include Mert Mumtaz (Helius CEO) and teams from a16z, Electric Capital, and Dragonfly.
- **Action:** confirm the official track list, rules, and submission portal.

---

## 3. What NEAR Intents is and how the 1Click API works (verified)

NEAR Intents is an intent-based cross-chain settlement system. The 1Click API wraps it in a deposit-and-receive flow, so integrators never talk to solvers directly.

### 3.1 Flow (e.g. Base → Sui)

1. **Quote:** `POST /v0/quote` with origin asset, destination asset, amount, recipient (on destination chain), refund address (on origin chain), deadline, slippage, and swap type.
2. **Deposit address:** the quote returns a single-use deposit address on the origin chain.
3. **Deposit:** the payer sends a normal transfer to that address. Optionally submit the tx hash.
4. **Fill:** market makers (solvers) deliver the destination asset to the recipient.
5. **Status:** poll `GET /v0/status?depositAddress=...` until the swap ends in success, failure, or refund. Failed swaps refund to the refund address.

### 3.2 Useful facts

- Asset IDs come from `GET /v0/tokens` and look like `nep141:<chain>-<address>.omft.near`.
- `depositType`: `ORIGIN_CHAIN` or `INTENTS` (funds already held inside Intents).
- `recipientType`: `DESTINATION_CHAIN` or `INTENTS` (an Intents account).
- `EXACT_OUTPUT` quotes guarantee the amount the recipient gets (used by the MPP integration).
- Without an API key/JWT, a 0.2% fee applies. There is **no testnet**; test with small amounts.
- Holding balances inside `intents.near` makes subsequent swaps faster.
- Official quickstart: allow up to 15 minutes for cross-chain processing.
- Settlement is **not trustless**: while a swap is in flight, deposits are custodied by the Intents settlement system, which either delivers or refunds.
- SDK: `@defuse-protocol/one-click-sdk-typescript`. OpenAPI spec at `1click.chaindefuser.com/docs/v0/openapi.yaml`.

### 3.3 Settlement time (no official SLA found)

| Source                                        | Figure                                                   |
| --------------------------------------------- | -------------------------------------------------------- |
| One integrator's tool description (secondary) | typically 30–60 seconds                                  |
| Official quickstart                           | allow up to 15 minutes                                   |
| Bitcoin origin (MPP docs)                     | 45–60 minutes because of on-chain confirmations          |
| Each quote                                    | returns a `timeEstimate` per route — use this at runtime |

**Action:** measure real settlement times for each of our corridors during testing.

---

## 4. Which chains Intents supports (verified; list expands over time)

Always confirm live with `GET /v0/tokens`.

- **EVM:** Arbitrum, ADI, Aurora, Base, Bera, BNB Chain, Ethereum, Gnosis, Optimism, Plasma, Polygon, Avalanche, Monad, XLayer. Robinhood Chain added September 18, 2026.
- **Bitcoin family:** BTC, BCH, DOGE, LTC, ZEC (transparent only).
- **Other L1s:** Cardano (partial), Aleo, Solana, Sui, Stellar, TON, Tron, XRP, Starknet. NEAR is the hub.
- Chains reach NEAR through different bridges, each with its own trust model.

### Chains we selected to start (our decision)

- **EVM:** Ethereum, Monad, X Layer, Base, Arbitrum, Robinhood Chain, Polygon.
- **Other L1s:** Solana, Sui, TON, Tron, XRP, NEAR (the hub).
- **Bitcoin family:** payer-side only, via Lightning (see section 9).
- Suggested minimum launch set if scope must shrink: **Base, Solana, NEAR, Sui**, plus Bitcoin as payer-only.

---

## 5. x402 landscape

### 5.1 How x402 works (short)

- A server answers an unpaid request with HTTP 402 and a list of accepted payment options (`accepts[]`).
- The client picks one, signs a payment, and retries.
- A **facilitator** verifies and settles the payment on-chain on behalf of the server. It exposes `/verify`, `/settle`, and `/supported`. Facilitators are an architectural role, so anyone can run one.
- x402 is designed to be trust-minimizing: schemes must not let a facilitator or server move funds beyond what the client intended. **Our design must respect this.**

### 5.2 Native x402 support by chain

**Correction made during research:** an early claim that Sui and NEAR had no x402 was wrong. The official spec repo and docs show more support than first found.

| Chain / family                          | x402 status                                  | Notes                                                                                                                                                                                                   |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EVM (Base, Arbitrum, Polygon, Monad)    | Live                                         | Coinbase (CDP) facilitator lists Base, Polygon, Arbitrum, Monad, World, Solana (verified)                                                                                                               |
| X Layer, Avalanche, Sei, SKALE          | Live                                         | PayAI facilitator (verified)                                                                                                                                                                            |
| Ethereum mainnet                        | Not seen in facilitator lists                | May work via EVM scheme; unconfirmed                                                                                                                                                                    |
| Robinhood Chain                         | Not seen                                     | Depends on whether the stablecoin supports signed transfer authorizations — **check first**                                                                                                             |
| Solana                                  | Live                                         | Official scheme and facilitators                                                                                                                                                                        |
| TON                                     | Supported per x402 docs                      |                                                                                                                                                                                                         |
| Stellar, Aptos, Hedera, Keeta, Starknet | Supported per docs / spec list               |                                                                                                                                                                                                         |
| Sui                                     | Official spec exists (`scheme_exact_sui.md`) | Verified in the spec repo                                                                                                                                                                               |
| NEAR                                    | Exists                                       | Official repo e2e tests include NEAR; FastNear runs a production facilitator for NEAR mainnet and Base. Payments are USDC `ft_transfer` signed as NEP-366 delegates; native NEAR is not a payment asset |
| XRP (XRPL)                              | Appears in e2e config (keyless facilitator)  | Spec not read — verify                                                                                                                                                                                  |
| Tron                                    | No evidence found                            |                                                                                                                                                                                                         |
| Bitcoin family                          | No native x402                               | See section 9 (Lightning / L402)                                                                                                                                                                        |

### 5.3 Discovery today is fragmented

- Coinbase's Bazaar catalogs only services that settled through the CDP facilitator.
- The x402.org facilitator keeps a separate catalog.
- Stellar-side (e.g. Veridex) and Binance (B402) run their own.
- No neutral, cross-chain index exists. **This is a gap we fill.**

---

## 6. Prior art we must be aware of (verified)

NEAR already pitches x402 and MPP (Machine Payments Protocol) settlement through Intents:

- A seller can set a **single-use 1Click deposit address as the x402 payment destination**. The agent pays from any supported chain; the seller receives the exact amount in its chosen asset on its chosen chain.
- An Agent Payments Skill funds x402 payments from assets on 35 chains.
- A NEAR Intents payment method exists for MPP (`@defuse-protocol/nearintents-mpp-sdk`), using `EXACT_OUTPUT` quotes and 1Click status polling.
- Failed swaps refund automatically on the buyer's chain.

**Implication:** routing alone is not our differentiator. Our value is: (a) a ready facilitator so sellers do not hand-roll this, (b) gasless, wallet-simple payer experience, (c) tiered delivery so it feels fast, (d) cross-chain discovery, (e) a Bitcoin/Lightning payer path, (f) per-chain adapters for chains with no or fragmented x402 support.

---

## 7. Idea evolution

### 7.1 Agent mandate layer (first idea)

A human signs a scoped spending permission for an agent (budget, allowed services, expiry). The agent pays any x402 service from any chain; limits are enforced by the layer, not by the agent's good behavior, and each payment yields a receipt.

Enabling tech: x402, MCP, NEAR function-call access keys (scoped, expiring keys), Chain Signatures (one account, many chains), TEEs for policy enforcement/key custody, and optionally ERC-8004 for agent identity/reputation.

This remains a valuable add-on module on top of the facilitator (spend limits enforced at the facilitator).

### 7.2 Cross-chain service economy

NEAR agents discover x402 services on other chains, and agents on other chains discover NEAR-hosted services. This requires a federated discovery index plus a facilitator that can pay across chains.

### 7.3 Own "power" facilitator

Own facilitator that: implements standard `/verify`, `/settle`, `/supported`; passes normal same-chain payments through to existing facilitators; and adds an extra cross-chain payment path via Intents. It must stay compatible with x402 already deployed on each chain.

### 7.4 Naming

**x402interop** (formerly Interopx402). Schemes are named per chain family, e.g. `x402interop-evm` (originally `Interopx402-evm-scheme`).

---

## 8. The scheme design

### 8.1 Why a new scheme

Standard `exact` schemes assume the buyer signs a transfer on the same chain the seller lists. We want the payer on chain A and the seller on chain B.

### 8.2 Structure (proposal)

- One cross-chain scheme with **per-family adapters** keyed by the buyer's chain family:
  `x402interop-evm`, `-svm` (Solana), `-sui`, `-tvm` (TON), `-tron`, `-xrpl`, `-near`.
- The buyer's family decides how the origin payment/deposit is signed. The seller's chain is the settlement network.
- The seller keeps its normal 402 response and adds one extra `accepts[]` entry for the interop path.
- Standard `/supported` advertises the new scheme alongside existing ones.

### 8.3 Key hypothesis to test (gasless origin payment)

**(hypothesis)** The buyer signs a standard gasless x402 `exact` payment on its own chain (e.g. an EIP-3009 transfer authorization on Base) with `payTo` set to a **single-use 1Click deposit address**. Existing facilitators on that chain can then settle it unchanged, and Intents completes the swap to the seller's chain.

Consequences:

- The seller's 402 response for this path must be **generated per request**, because each quote mints a new deposit address.
- The refund address should point to the buyer.
- Needs testing: that a facilitator-submitted transfer is accepted as a valid deposit, and how amounts/fees behave with `EXACT_OUTPUT`.

### 8.4 Draft shape (illustrative only — align with the x402 v2 spec before building)

```jsonc
// accepts[] entry the seller (or our middleware) adds
{
  "scheme": "x402interop-evm",
  "network": "sui:mainnet", // seller's settlement chain
  "asset": "<seller stablecoin>",
  "amount": "<exact output amount>",
  "payTo": "<seller address on settlement chain>",
  "extra": {
    "quoteId": "<1click quote id>",
    "depositAddress": "<single-use origin-chain address>",
    "originNetwork": "eip155:8453",
    "expiresAt": "<timestamp>",
    "deliveryMode": "on_deposit | on_success",
  },
}
```

Verify = check the signed payment targets the quoted deposit address, amount, and expiry. Settle = submit it on the origin chain and hand tracking to the status tracker.

---

## 9. Bitcoin via Lightning (L402)

- No native x402 on Bitcoin. Bitcoin works as a **payer-only** side: agent pays BTC, seller receives a supported stablecoin such as USDC.
- On-chain BTC is far too slow for HTTP (45–60 minutes through Intents), hence Lightning.
- We found **no evidence that Intents supports Lightning directly**; only on-chain Bitcoin. So Lightning is **our own leg**, not an Intents feature. L402 is the Lightning-native HTTP-402 standard and a useful reference for the invoice and proof flow.
- Intents is only needed for rebalancing on-chain BTC → stablecoin in the background.
- **Chosen approach (no float):** Lightning **top-up** — the invoice settles in seconds, the swap runs in the background, and the credit becomes spendable once the swap lands. After that, per-request payments from the credit are instant.
- Instant, no-float, pay-per-request in BTC from a cold start is not possible: someone must take the BTC-to-stablecoin timing risk.

---

## 10. The speed problem (HTTP needs fast responses)

Principle: **keep the cross-chain swap off the critical path of the HTTP request.**

### 10.1 Options considered

| Option                               | Idea                                                                                           | Outcome                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Float                                | Facilitator pays the seller instantly from its own liquidity, rebalances later through Intents | **Rejected** — we do not want to carry or present float risk                                    |
| Pre-positioning                      | Buyer keeps funds on each chain where it will pay                                              | **Rejected** — brings back multi-wallet management, which is exactly what Intents should remove |
| Deposit address with tiered delivery | Per-quote deposit address; seller chooses when to serve                                        | **Adopted (default)**                                                                           |
| Intents balance                      | Buyer deposits once into an Intents balance and pays from it                                   | **Adopted (repeat buyers)**                                                                     |
| Lightning top-up                     | BTC arrives fast, swap in background                                                           | **Adopted (Bitcoin payers)**                                                                    |

### 10.2 Tiered delivery (seller's choice)

1. **Serve on deposit confirmed** — good for cheap calls. Origin leg confirms in seconds on fast chains. If the swap later fails, it refunds the buyer; the seller's exposure is bounded by price.
2. **Serve on swap success** — for more expensive calls. Return a pending response (HTTP 202-style) and push the result by webhook, SSE, or polling when the swap succeeds. Agents handle async well.
3. **Fallback** — if the buyer has no funded path, return a normal 402 with top-up instructions.

### 10.3 Guardrails

- Buyer-signed payloads bound to seller, amount, nonce, and expiry (respects x402's trust-minimizing design).
- Per-buyer and per-seller exposure caps for deliver-on-deposit mode.
- Idempotent verify/settle, replay protection, and clear refund handling.
- Disclose to users that funds are custodied by the Intents system for the duration of a swap.

---

## 11. Final architecture

```
Buyer agent (pays on its own chain)
        │  signed x402 payment
        ▼
┌─────────────────── x402interop facilitator ───────────────────┐
│  Discovery index     Quote router         Status tracker       │
│  (federated catalogs (mints 1Click quotes, (polls 1Click,      │
│   + MCP tool)         chooses path)         webhooks, refunds, │
│                                             receipts)          │
└───────────────┬───────────────────────────────┬───────────────┘
                │                               │
          NEAR Intents (1Click)           Lightning node (L402)
   swaps, pays the seller's chain         BTC payers, top-up credit
                │
                ▼
Seller API (paid on its own chain)
```

### 11.1 Three payment paths (router picks per payment)

1. **Deposit address (default):** gasless x402 payment from the buyer's chain to a single-use 1Click deposit address; seller receives the exact amount on its chain.
2. **Intents balance (repeat buyers):** deposit once; later payments start from the balance (`depositType: INTENTS`), skipping origin-chain confirmation. One balance, not a wallet per chain.
3. **Lightning top-up (BTC payers):** Lightning invoice, credit after the background swap lands.

### 11.2 Core modules

- **Discovery index:** federates CDP Bazaar, other catalogs, and our own registrations; exposed as an MCP tool so agents can search across chains. Includes NEAR-hosted services.
- **Quote router:** mints 1Click quotes, picks the path, and keeps `/verify`, `/settle`, `/supported` standard so existing x402 clients work. Passes same-chain `exact` payments straight through to existing facilitators (for example FastNear for NEAR).
- **Status tracker:** polls 1Click status, sends webhooks, drives refunds, and issues receipts with origin and destination transaction hashes.
- **Optional mandate layer:** agent spend limits, allowlists, and expiry (see 7.1).

---

## 12. Differentiators summary

1. Ready-made facilitator for cross-chain payments (sellers do not hand-roll 1Click flows).
2. Gasless, single-wallet experience for payers and sellers.
3. Tiered delivery to make cross-chain feel fast without float.
4. Federated cross-chain discovery for agents via MCP.
5. Per-chain adapters, including chains with thin or fragmented x402 support (Sui, NEAR, XRP, TON, Tron).
6. Bitcoin payer path through Lightning.
7. Optional mandate layer for safe agent spending.

---

## 13. Risks and open questions

**Technical**

- Real settlement times per corridor (no official SLA).
- Whether the gasless deposit-address hypothesis (8.3) works end to end on each EVM chain.
- Robinhood Chain: stablecoin support for signed transfer authorizations.
- Tron and XRPL x402 spec status and tooling.
- Lightning infrastructure choice (self-run node vs. service) and how to verify L402 proofs.
- Dynamic 402 responses (per-quote addresses) and how sellers integrate them (middleware).
- Quote expiry versus origin-chain confirmation time, especially for slower chains.

**Trust and compliance**

- Intents custody during swaps; refund paths must be clear to users.
- Whether operating a facilitator or Lightning node triggers regulatory or licensing obligations in the jurisdictions we serve. Get proper legal advice before launch.
- Sensitive handling of the 1Click JWT (server-side only).

**Product**

- Which seller types to onboard first (API providers, data services, agent-to-agent services).
- Pricing: our fee on top of the 0.2% default Intents fee (reduced with a partner JWT).

---

## 14. Suggested build plan (for a November 1–14 hackathon, if targeted)

1. **Days 1–4:** Base → Sui (and Base → NEAR) over the deposit-address path. Dynamic 402 middleware plus the status tracker. Measure real timings.
2. **Days 5–8:** Discovery index and MCP tool federating at least two existing catalogs plus our own registry.
3. **Days 9–11:** Intents-balance path for repeat buyers; tiered delivery modes.
4. **Days 12–14:** Demo: an agent finds a Sui-hosted service via MCP, pays from Base, and receives the result. Polish docs and the demo video. Stretch: Lightning top-up demo.

Scope rule: one working corridor end to end beats many half-built adapters.

---

## 15. Decisions log

| Decision                | Detail                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| Name                    | x402interop (formerly Interopx402)                                 |
| Own facilitator         | Yes, compatible with existing deployed x402                        |
| Scheme structure        | One scheme, per-chain-family adapters (e.g. `x402interop-evm`)     |
| Starting EVM chains     | Ethereum, Monad, X Layer, Base, Arbitrum, Robinhood Chain, Polygon |
| Starting other L1s      | Solana, Sui, TON, Tron, XRP, NEAR                                  |
| Bitcoin                 | Payer-only via Lightning (L402), not selected as a seller chain    |
| Float risk              | Not accepted; no facilitator-fronted liquidity                     |
| Multi-wallet management | Must be avoided for both payer and seller                          |
| Pre-positioning         | Rejected                                                           |
| Default payment path    | Deposit address plus tiered delivery                               |

---

## 16. Sources consulted

- NEAR developer docs: docs.near.org
- NEAR Intents docs: docs.near-intents.org (1Click API, chain support, first swap)
- NEAR agentic payments page: near.org/agentic-payments
- MPP NEAR Intents payment method: mpp.dev/payment-methods/nearintents
- x402 docs and spec repo (network and token support, exact scheme specs including Sui)
- Coinbase x402 Bazaar and CDP docs
- FastNear x402 facilitator and NEAR x402 docs
- Sui blog on NEAR Intents swaps into Sui
- SwapKit, Ledger, and Brave integrations of NEAR Intents (for chain coverage context)
- Third-party news coverage of the NEAR hackathon (to be confirmed with official sources)

_Everything above reflects research as of October 27, 2026. Chain lists, facilitator support, and hackathon details change quickly; re-verify before building or presenting._
