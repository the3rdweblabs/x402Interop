<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS"
-->

# Product walkthrough

An agent discovers a service on another chain and pays for it from its own chain, with no bridge and no extra wallet.

## What you need

- A seller API on Sui (or NEAR) protected by the x402interop middleware, and registered in discovery.
- A buyer agent with funds only on Base.
- A facilitator running with the Base to Sui corridor enabled. Use small amounts.

## Steps

### 1. The gap

The agent holds USDC on Base. The service is paid in USDC on Sui. A same-chain x402 payment cannot complete that call, because the buyer and the seller are not on the same network.

### 2. Discovery

The agent runs `search_services` for the target service. Results come from more than one catalog, including the Sui service. One search covers catalogs and chains.

### 3. Quote

The agent calls `prepare_payment`. The response includes the single-use deposit address, the exact price, the fees, and the estimated time. The seller receives an exact amount on Sui. The agent pays on Base.

### 4. Pay and fetch

The agent calls `pay_and_fetch`. It signs a gasless payment. Status moves through `deposit_seen`, `processing`, and `success`. The result comes back with a receipt that carries both transaction hashes. There is no bridge, no Sui wallet, and no gas on Base.

### 5. Tiered delivery

The same call in `on_deposit` mode is served as soon as the deposit confirms. `on_success` waits for the swap. Sellers choose when to serve. A failed swap refunds automatically.

### 6. Bitcoin (optional)

A Lightning top-up becomes spendable credit. A Bitcoin holder tops up over Lightning and spends as stablecoin.

## Notes

- Measure the real settlement time. A quote estimate is not a measured result.
- One working corridor is more useful than several half-working ones.
- State the custody trade-off plainly: NEAR Intents holds the funds while the swap is in flight.
