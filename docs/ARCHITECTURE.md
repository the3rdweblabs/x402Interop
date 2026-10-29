<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS"
-->

# Architecture

Status: design draft. Date: October 27, 2026.

## 1. Goals

1. A buyer on chain A can pay a seller on chain B using only wallets they already have.
2. Compatible with x402 already deployed on each chain. Same-chain payments must keep working unchanged.
3. No facilitator float. The facilitator never fronts its own money.
4. Agents can discover x402 services across chains.
5. Fast enough for HTTP: swaps must not sit inside the request unless the seller chooses to wait.

## 2. Components

### 2.1 Facilitator core

Implements the standard x402 facilitator surface (`/supported`, `/verify`, `/settle`). Requests for existing schemes on existing chains are forwarded to the appropriate chain facilitator (for example Coinbase CDP, PayAI, or FastNear for NEAR). Requests for `x402interop-*` schemes are handled by the cross-chain engine.

### 2.2 Quote router

- Mints NEAR Intents 1Click quotes. For seller payments it uses exact-output quotes so the seller receives a fixed amount.
- Chooses the payment path (section 3).
- Returns the per-request payment requirements: the single-use deposit address, quote id, expiry, and estimated settlement time (`timeEstimate` from the quote).

### 2.3 Status tracker

- Polls the 1Click status endpoint for each deposit address.
- Emits webhooks/SSE events to sellers: `deposit_seen`, `processing`, `success`, `refunded`, `failed`.
- Records receipts containing origin and destination transaction hashes.
- Handles refunds and surfaces them to buyers.

### 2.4 Discovery index

- Crawls and federates existing x402 catalogs (for example Coinbase Bazaar and other facilitator catalogs) and accepts direct seller registrations.
- Normalizes entries: name, description, price, accepted chains and assets, input/output schema, health.
- Exposed over HTTP and as MCP tools (see AGENT_MCP_GUIDE).
- Treats all catalog text as untrusted data (see SECURITY).

### 2.5 Chain adapters

One module per chain family that knows how the buyer signs the origin payment and how to verify it: `evm`, `svm`, `sui`, `tvm` (TON), `tron`, `xrpl`, `near`. Bitcoin is handled by the Lightning module.

### 2.6 Lightning module

Accepts Lightning payments for top-up credit (L402-style proof of payment). Rebalances BTC to stablecoin in the background through Intents. See section 5.

### 2.7 Optional mandate layer

Buyer-side spend policy: budget, allowed services, expiry, and approval rules. Enforced at the facilitator and/or in the agent's wallet layer.

## 3. Payment paths

### Path 1: deposit address (default)

1. Agent requests a resource. The seller (or middleware) returns 402 with an `x402interop-*` requirement generated per request, containing a single-use deposit address from a fresh 1Click quote.
2. The buyer signs a gasless x402 payment on its own chain with `payTo` = deposit address. **(hypothesis)** Standard `exact`-style authorizations (for example EIP-3009 on EVM) work with a deposit address as recipient, and a facilitator-submitted transfer counts as a valid deposit.
3. The facilitator settles the origin leg. Intents swaps and delivers to the seller on the seller's chain.
4. The status tracker reports progress; the seller serves according to its delivery mode.

### Path 2: Intents balance (repeat buyers)

1. Buyer deposits once into an Intents balance (any supported origin chain).
2. Later quotes use `depositType: INTENTS`, skipping origin-chain confirmation.
3. Settlement to the seller's chain proceeds as in path 1.

### Path 3: Lightning top-up (BTC payers)

1. Facilitator issues a Lightning invoice for the top-up amount.
2. Payment settles in seconds. A background job swaps BTC to stablecoin through Intents.
3. When the swap lands, the buyer's credit becomes spendable; per-request payments draw on credit instantly.

## 4. Delivery modes (seller choice)

| Mode             | Seller serves when                                         | Best for           | Seller exposure                                                            |
| ---------------- | ---------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `on_deposit`     | Origin deposit confirmed                                   | Cheap, fast calls  | Swap fails after serving: buyer is refunded, seller loses the call's value |
| `on_success`     | Swap reports success                                       | Expensive calls    | None                                                                       |
| Pending-and-push | Immediately returns "pending"; result is pushed on success | Long-running tasks | None                                                                       |

Fallback: if the buyer has no funded path, return a normal 402 with top-up instructions.

## 5. Why no float

A float-based design (facilitator pays the seller instantly from its own liquidity, rebalances later) was considered and rejected: it makes the facilitator carry market and counterparty risk. Pre-positioning funds on each chain was also rejected because it forces buyers to manage wallets on many chains. The adopted design moves the timing risk to the seller's explicit, capped choice of delivery mode.

## 6. Latency model

- Origin leg: seconds on fast chains (depends on chain finality).
- Swap leg: no official SLA found. One integrator describes 30-60 seconds as typical; the official quickstart says to allow up to 15 minutes; Bitcoin on-chain origin is 45-60 minutes. Every quote returns `timeEstimate`; use it at runtime. Real numbers are tracked in TEST_REPORT.
- Deliver-on-deposit keeps cheap calls near origin-chain speed.

## 7. Compatibility

- Same-chain payments: forwarded untouched to existing facilitators.
- Sellers keep their existing 402 `accepts[]` entries and add one x402interop entry.
- Chains with native x402 (EVM chains, Solana, TON, Sui, NEAR, and others) can use native schemes for same-chain payments; x402interop only handles the cross-chain case.

## 8. Key risks

- Intents custody during swaps (not trustless).
- No official settlement-time guarantee.
- Dynamic 402 responses require seller middleware.
- Regulatory questions around operating payment infrastructure; obtain legal advice before launch.
- Chain coverage in Intents changes over time.

## 9. Build order

1. Base to Sui and Base to NEAR on path 1, with status tracker.
2. Discovery index plus MCP tools.
3. Path 2 (Intents balance) and delivery modes.
4. Lightning top-up (stretch).
