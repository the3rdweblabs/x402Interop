---
name: x402interop
description: >
  Use this skill when an HTTP request returns 402 Payment Required and the seller supports x402interop (cross-chain), when the user wants to pay for an x402 resource from a different chain using NEAR Intents, when they want to discover x402interop services, or when they need to fund for a cross-chain x402 payment. Triggers: "x402interop", cross-chain 402, pay from different chain, "fund via intents", discover cross-chain x402 services.
compatibility: >
  Works with existing x402 v2 clients/servers. Supports the x402interop-* scheme family. Uses NEAR Intents 1Click for cross-chain settlement. No facilitator API keys required for discovery/quotes against public facilitators; seller API keys may be needed depending on deployment.
metadata:
  version: '1.0.0'
  author: 'THE3RDWEBLABS'
  homepage: 'https://github.com/the3rdweblabs/x402Interop'
---

<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# x402Interop - Cross-chain x402 Payments

x402Interop is an interoperability layer on top of x402 v2. A buyer pays on the chain they already use; a seller receives payment on their preferred chain. Cross-chain settlement goes through NEAR Intents.

## Quick start

1. **Discover a service** (optional) - `node skills/x402interop/scripts/discover-services.mjs search [query]`
2. **Check price without paying** - `node skills/x402interop/scripts/check-price.mjs <url> [--method GET|POST] [--body ...]`
3. **Get a quote / prepare payment** - if the seller uses x402interop middleware with `mintQuotes: true`, the 402 includes quote info from the facilitator; otherwise call the facilitator's `POST /interop/quote`. A minted quote asks 1Click for a 30 minute deadline. Use the quote's own `expiresAt`.
4. **Ensure funds on buyer chain** - if balance < required, fund via NEAR Intents (see `references/near-intents-funding.md`). Always confirm refund destination.
5. **Pay** - the buyer wallet signs and sends the payment for the chosen `x402interop-*` scheme. `pay.mjs` only enforces `--max-price` and prints the requirement. It does not sign or broadcast.
6. **Track status** - poll `GET <facilitator>/interop/status/<quoteId>` until `success`, `refunded`, or `failed`. Earlier states are `pending_deposit`, `deposit_seen`, and `processing`. There is no webhook.

## Key concepts

- **Scheme family**: the buyer's chain family determines the scheme id. All twelve are `x402interop-evm`, `x402interop-svm`, `x402interop-sui`, `x402interop-near`, `x402interop-tvm`, `x402interop-tron`, `x402interop-xrpl`, `x402interop-lightning`, `x402interop-aptos`, `x402interop-stellar`, `x402interop-starknet`, and `x402interop-utxo`. `/supported` lists `x402interop-evm` only. SVM, NEAR, and Sui verify when the facilitator is given a node client, and the hosted facilitator does not supply one. Aptos, Stellar, Starknet, and UTXO stay `not_implemented`.
- **Quote**: facilitator mints a single-use deposit address, binds to quoteId/depositAddress/origin/destination amounts, expiry, delivery mode, and `refundTo`.
- **Binding**: payment payload must include binding (quoteId, depositAddress, nonce, expiresAt) tied to the chosen quote to prevent redirection.
- **Delivery modes**: `on_deposit` (serve once the origin deposit is accepted), `on_success` (serve only after the swap succeeds; otherwise `402`), `pending_push` (`202` and the status URL; the resource is not served). Webhook delivery is not implemented.
- **No float**: facilitator never fronts liquidity; funds go via deposit address to NEAR Intents.
- **Compatible**: follows x402 v2 types/headers (`PAYMENT-SIGNATURE`, `PAYMENT-REQUIRED`) so existing x402 tooling can interoperate.

## Rules (safety)

- **Always ask before executing commands** - show exact command and wait for explicit approval.
- **Always show price before paying** - use `check-price.mjs` or inspect 402. Confirm with user before paying.
- **Enforce hard price cap** - never pay more than the confirmed price. If quote changes at payment time, fail closed and re-confirm.
- **Confirm refund destination** - when funding via NEAR Intents, confirm `refundTo` (address + chain) with user before depositing.
- **Respect delivery mode** - only serve per the seller's `deliveryMode`. Poll `/interop/status/<quoteId>`. Do not wait for a webhook.
- **Don't log secrets** - never log facilitator API keys, 1Click keys, or private keys.
- **Handle auth expiry** - if wallet auth is missing/expired, stop and tell user how to log in; don't try to recover secrets.
