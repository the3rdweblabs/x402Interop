---
name: x402interop
description: >
  Use this skill when an HTTP request returns 402 Payment Required and the seller supports x402interop (cross-chain), when the user wants to pay for an x402 resource from a different chain using NEAR Intents, when they want to discover x402interop services, or when they need to fund for a cross-chain x402 payment. Triggers: "x402interop", cross-chain 402, pay from different chain, "fund via intents", discover cross-chain x402 services.
compatibility: >
  Works with existing x402 v2 clients/servers. Supports the x402interop-* scheme family. Uses NEAR Intents 1Click for cross-chain settlement. No facilitator API keys required for discovery/quotes against public facilitators; seller API keys may be needed depending on deployment.
metadata:
  version: "1.0.0"
  author: "THE3RDWEBLABS"
  homepage: "https://github.com/the3rdweblabs/x402Interop"
---

# x402Interop - Cross-chain x402 Payments

x402Interop is an interoperability layer on top of x402 v2. A buyer pays on the chain they already use; a seller receives payment on their preferred chain. Cross-chain settlement goes through NEAR Intents.

## Quick start

1. **Discover a service** (optional) - `node skills/x402interop/scripts/discover-services.mjs search [query]`
2. **Check price without paying** - `node skills/x402interop/scripts/check-price.mjs <url> [--method GET|POST] [--body ...]`
3. **Get a quote / prepare payment** - if the seller uses x402interop middleware with `mintQuotes: true`, the 402 will include quote info from the facilitator; otherwise call the facilitator's `/interop/quote`.
4. **Ensure funds on buyer chain** - if balance < required, fund via NEAR Intents (see `references/near-intents-funding.md`). Always confirm refund destination.
5. **Pay** - sign and send the payment for the chosen `x402interop-*` scheme. Enforce the confirmed price as a hard cap.
6. **Track status** - poll `GET <facilitator>/interop/status/<quoteId>` until `success`/`refunded`/`failed`.

## Key concepts

- **Scheme family**: buyer's chain family determines scheme id (`x402interop-evm`, `x402interop-svm`, `x402interop-sui`, `x402interop-near`, `x402interop-tvm`, `x402interop-tron`, `x402interop-xrpl`, `x402interop-lightning`).
- **Quote**: facilitator mints a single-use deposit address, binds to quoteId/depositAddress/origin/destination amounts, expiry, delivery mode, and `refundTo`.
- **Binding**: payment payload must include binding (quoteId, depositAddress, nonce, expiresAt) tied to the chosen quote to prevent redirection.
- **Delivery modes**: `on_deposit` (fast, serve on origin deposit seen), `on_success` (serve only after swap succeeds), `pending_push` (202 + status URL/webhook).
- **No float**: facilitator never fronts liquidity; funds go via deposit address to NEAR Intents.
- **Compatible**: follows x402 v2 types/headers (`PAYMENT-SIGNATURE`, `PAYMENT-REQUIRED`) so existing x402 tooling can interoperate.

## Rules (safety)

- **Always ask before executing commands** - show exact command and wait for explicit approval.
- **Always show price before paying** - use `check-price.mjs` or inspect 402. Confirm with user before paying.
- **Enforce hard price cap** - never pay more than the confirmed price. If quote changes at payment time, fail closed and re-confirm.
- **Confirm refund destination** - when funding via NEAR Intents, confirm `refundTo` (address + chain) with user before depositing.
- **Respect delivery mode** - only serve per seller's `deliveryMode` and webhook/status.
- **Don't log secrets** - never log facilitator API keys, 1Click keys, or private keys.
- **Handle auth expiry** - if wallet auth is missing/expired, stop and tell user how to log in; don't try to recover secrets.
