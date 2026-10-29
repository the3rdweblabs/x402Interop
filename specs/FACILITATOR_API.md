<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS"
-->

# Facilitator API reference (DRAFT)

Base URL: `https://<your-facilitator>`

This facilitator implements the standard x402 v2 facilitator surface (`/supported`, `/verify`, `/settle`) per the x402 Foundation specification, with additional x402interop extensions under `/interop/*`. Endpoints under `/interop` are x402interop extensions and are drafts.

## Standard x402 endpoints (conform to x402 v2)

### GET /supported

Lists supported scheme and network pairs, including pass-through schemes and the `x402interop-*` family. Response shape MUST follow x402 v2 `SupportedResponse`.

### POST /verify

Verifies a payment payload against payment requirements. Request/response MUST follow x402 v2 `VerifyRequest`/`VerifyResponse`.

- For existing schemes: forwarded to the relevant chain facilitator.
- For `x402interop-*`: runs the checks in SCHEME_SPEC section 6.

### POST /settle

Settles a verified payment. Request/response MUST follow x402 v2 `SettleRequest`/`SettleResponse`.

- For `x402interop-*`: submits the origin transfer, starts tracking, returns a receipt shaped by `deliveryMode`.

## Extension endpoints

### POST /interop/quote

Mints a cross-chain quote and returns ready-to-use payment requirements for a seller's 402 response.

Request:

```json
{
  "sellerNetwork": "sui:mainnet",
  "sellerAsset": "<asset id>",
  "sellerAddress": "<address>",
  "amount": "50000",
  "buyerNetwork": "eip155:8453",
  "buyerAsset": "<asset id>",
  "buyerAddress": "<address>",
  "deliveryMode": "on_deposit"
}
```

Response: an `x402interop-*` payment requirements object (see SCHEME_SPEC section 4).

Notes: the buyer's chain may be unknown at 402 time. Sellers can either request one quote per advertised buyer network or call this endpoint after the client announces its network.

### GET /interop/status/{quoteId}

Returns the swap state: `pending_deposit`, `deposit_seen`, `processing`, `success`, `refunded`, `failed`, plus origin and destination transaction hashes when known and `timeEstimateSeconds`.

### POST /interop/webhooks

Registers a seller webhook (or SSE stream) for events: `deposit_seen`, `processing`, `success`, `refunded`, `failed`. Webhooks are signed; verify the signature before acting.

## Discovery endpoints

### GET /interop/discovery/search

Query parameters: `q`, `network`, `asset`, `maxPrice`, `category`, `limit`.
Returns normalized service entries (name, description, price, accepted chains and assets, schema, health, source catalog).

### POST /interop/discovery/register

Seller registers a service. Body includes resource URL, description, price, accepted networks, input/output schema, and contact. The index probes the URL, expects a valid 402 response, and marks it healthy or not.

### GET /interop/discovery/{serviceId}

Returns one service entry with its most recent health check.

## Credit endpoints (paths 2 and 3)

### POST /interop/credit/topup

Creates a top-up intent. Returns either an Intents deposit instruction (path 2) or a Lightning invoice (path 3).

### GET /interop/credit/{account}

Returns spendable credit, pending credit (swap in progress), and recent activity.

## Errors

Use standard HTTP status codes with a JSON body: `{ "error": "<code>", "message": "<human text>" }`. Suggested codes: `quote_expired`, `amount_mismatch`, `nonce_reused`, `unsupported_corridor`, `exposure_limit`, `swap_failed`, `refunded`.

## Rate limits and auth

- Seller-facing endpoints require an API key issued by the facilitator operator.
- Discovery search may be public with rate limits.
- The upstream 1Click API key is held server-side only.
