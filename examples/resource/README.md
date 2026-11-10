<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# x402Interop resource example

A small protected resource service that uses `@x402interop/*` packages **in-process** (no external facilitator URL).

- `MODE=test` (default): uses the simulated 1Click client via `createOneClickClient({ type: 'simulator' })`. No mainnet spend, no real 1Click API key, and the facilitator can settle signed EVM interop proofs deterministically.
- `MODE=live`: uses real 1Click (`createOneClickClient({ type: 'live' })`) and requires `ONECLICK_API_KEY` plus real destination seller addresses.
- Sellers always receive at their final address, including the NEAR report. 1Click performs the last-mile withdrawal; there is no Intents-balance fallback.

## Endpoints

- `GET /health`
- `GET /catalog` - lists protected resources and destination payment terms (Sui USDC, NEAR USDC, etc.)
- `GET /r/:id` - returns `402 Payment Required` with an x402Interop quote. By default browsers get the full JSON requirements, API clients get the minimal `{"error":"Payment required"}` body, and the full quote is always in the base64 `PAYMENT-REQUIRED` header. Set `PAYMENT_REQUIRED_BODY=json` to force full JSON, `error` for minimal-only, or `empty` for no body. Pass `buyerNetwork`, `buyerAssetId`, `buyerAddress` as query params for accurate quotes.
- `GET|POST /r/:id` with `PAYMENT-SIGNATURE` (base64 JSON `{ x402Version, paymentRequirements, paymentPayload }`) - verifies/settles via facilkit and serves content on success
- Facilitator passthrough: `/interop/*`, `/verify`, `/settle`, `/supported`

## Run

```sh
cp .env.example .env
pnpm --filter x402interop-example-resource build
pnpm --filter x402interop-example-resource start
```

Seller addresses are env-required. In `MODE=test`, placeholder values are fine because the simulator does not deliver on-chain.
