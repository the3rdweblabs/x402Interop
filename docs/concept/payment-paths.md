<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Payment paths

The quote router classifies each payment into one of three paths. The facilitator classifies; 1Click executes.

## 1. Deposit address (default)

For buyers without an Intents balance. The seller (or middleware) returns 402 with a requirement containing a single-use deposit address from a fresh 1Click quote.

### Flow

1. Agent requests a resource.
2. Seller mints a 1Click quote and wraps it in a 402 `PaymentRequired` body.
3. Buyer signs a gasless payment on its own chain with `payTo` = deposit address.
4. Facilitator settles the origin leg; Intents swaps and delivers to the seller on the seller's chain.
5. Status tracker reports progress; the seller serves according to its delivery mode.

> Gasless EIP-3009 transfer to a deposit address counts as a valid 1Click deposit - marked **(hypothesis)** until measured.

## 2. Intents balance (repeat buyers)

Buyer deposits once into an Intents balance (any supported origin chain). Later quotes use `depositType: INTENTS`, skipping origin-chain confirmation. Settlement to the seller's chain proceeds as in path 1.

## 3. Lightning top-up (BTC payers)

1. Facilitator issues a Lightning invoice for the top-up amount.
2. Payment settles in seconds. A background job swaps BTC to stablecoin through Intents.
3. When the swap lands, the buyer's credit becomes spendable; per-request payments draw on credit instantly.

## Classification

```ts
import { selectPaymentPath } from '@x402interop/intents'

selectPaymentPath({ buyerNetwork: 'lightning:mainnet' }) // 'lightning_topup'
selectPaymentPath({ buyerNetwork: 'eip155:8453', depositType: 'INTENTS' }) // 'intents_balance'
selectPaymentPath({ buyerNetwork: 'eip155:8453' }) // 'deposit_address'
```

## Selection logic

| Buyer network                | depositType             | Path              |
| ---------------------------- | ----------------------- | ----------------- |
| `lightning:*` or `lightning` | any                     | `lightning_topup` |
| any                          | `INTENTS`               | `intents_balance` |
| any                          | `ORIGIN_CHAIN` or unset | `deposit_address` |
