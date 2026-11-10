<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Scheme spec

Cross-chain x402 scheme specification for the `x402interop-*` family. Draft v0.1.

## Wire format

**Interop entry:**

```jsonc
{
  "scheme": "x402interop-evm",
  "network": "eip155:8453",
  "asset": "0x8335...2913",
  "amount": "10000",
  "payTo": "0xDepositAddress",
  "maxTimeoutSeconds": 300,
  "extra": {
    "recipient": "0xSeller",
    "quoteId": "q_...",
    "depositAddress": "0xDepositAddress",
    "nonce": "n_...",
    "expiresAt": "2026-10-31T12:05:00.000Z",
    "asset": "0x8335...2913",
  },
}
```

**Payload:**

```jsonc
{
  "x402Version": 2,
  "accepted": { "…": "the chosen requirement" },
  "payload": {
    "authorization": { "…": "scheme-specific signature material" },
    "binding": { "quoteId": "...", "depositAddress": "...", "nonce": "...", "expiresAt": "…" },
  },
  "extensions": {
    "x402interop": { "quoteId": "...", "depositAddress": "...", "recipient": "…" },
  },
}
```

Note: `payTo` is now the deposit address; the seller lives in `extra.recipient`. This is the only shape a generic x402 client or explorer can interpret.

## Verify

The facilitator checks `binding.depositAddress` against `extra.recipient`, enforces `expiresAt`, and requires an origin transaction hash plus a valid proof before trusting a 1Click `SUCCESS`.

## Settle

After verification, settlement returns `originTxHash` (and `destinationTxHash` when 1Click reports it). Pending states are reported so the buyer retries.

## Refund

Failed swaps refund to `refundTo` on the origin chain.

## Mirrored specs

Official scheme specifications (verbatim copies with source headers) live under [`specs/schemes/`](/specs/schemes):

- `exact/` - `scheme_exact.md`, `scheme_exact_algo.md`, and per-chain variants (EVM, SVM, NEAR, TON, XRPL, Aptos, Stellar, Sui, Starknet, Lightning)
- `upto/`, `auth-capture/`, `batch-settlement/`

Where an official upstream package exists, we delegate to it. Where a spec exists but no upstream package does, we implement the scheme spec-natively in `@x402interop/adpt`. Where no spec exists (TRON, UTXO), the chain is interop-only.
