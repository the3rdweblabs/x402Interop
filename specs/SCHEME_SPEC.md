<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS"
-->

# x402interop scheme specification (DRAFT v0.1)

Status: draft for discussion. This specification extends the [x402 v2 protocol](https://github.com/x402-foundation/x402) published by the x402 Foundation. It does not redefine the base protocol; it defines an interoperability scheme family and facilitator extensions that operate on top of standard x402 types and transport.

## 1. Purpose

Define a payment scheme family that lets a buyer on chain A pay a seller on chain B through a facilitator, using NEAR Intents for the cross-chain leg. A standard x402 client/server can remain compatible if it follows x402 v2 types and headers.

## 2. Naming

One scheme family with per-chain-family adapters, named by the **buyer's** chain family:

| Scheme id               | Buyer family                          |
| ----------------------- | ------------------------------------- |
| `x402interop-evm`       | EVM chains                            |
| `x402interop-svm`       | Solana                                |
| `x402interop-sui`       | Sui                                   |
| `x402interop-tvm`       | TON                                   |
| `x402interop-near`      | NEAR                                  |
| `x402interop-xrpl`      | XRP Ledger                            |
| `x402interop-tron`      | Tron (spec TBD)                       |
| `x402interop-lightning` | Bitcoin via Lightning (top-up credit) |

The seller's settlement network is carried in the payment requirements (`network`), not in the scheme id.

## 3. Roles

- **Buyer:** holds funds on origin chain; signs the payment.
- **Seller / resource server:** wants payment on the settlement chain.
- **Facilitator:** mints quotes, verifies, settles the origin leg, tracks the swap.
- **NEAR Intents (1Click):** executes the cross-chain swap and delivers to the seller; custodies funds during the swap.

## 4. Payment requirements (402 response entry)

Generated **per request** because every quote mints a single-use deposit address.

```jsonc
{
  "scheme": "x402interop-evm",
  "network": "sui:mainnet", // seller's settlement network (example id)
  "asset": "<seller asset id>",
  "amount": "<exact output amount, smallest unit>",
  "payTo": "<seller address on settlement network>",
  "maxTimeoutSeconds": 300,
  "extra": {
    "quoteId": "<1click quote id>",
    "depositAddress": "<single-use origin-chain address>",
    "originNetwork": "eip155:8453", // example: Base
    "originAsset": "<origin asset id>",
    "originAmount": "<quoted input amount>",
    "expiresAt": "2026-10-27T12:00:00Z",
    "timeEstimateSeconds": 45,
    "deliveryMode": "on_deposit", // on_deposit | on_success | pending_push
    "refundTo": "<buyer address on origin chain>",
  },
}
```

Notes:

- Exact-output quoting means the seller receives `amount`; the buyer's `originAmount` includes swap fees and slippage.
- The 1Click API key must never appear in this object.
- `refundTo` must be the buyer's address on the origin chain so failed swaps return funds to the buyer.
- This entry MUST conform to the x402 v2 `PaymentRequirements` shape. Cross-chain context MAY be placed in `extra` and/or in the `x402interop` extension (see the x402 v2 extensions model). Prefer using `extensions.x402interop` for machine-readable quote metadata and keep `extra` minimal for compatibility.

## 5. Payment payload (client to server)

The payload MUST conform to the x402 v2 `PaymentPayload` shape (`x402Version`, `resource?`, `accepted`, `payload`, `extensions?`). For HTTP transport, the client MUST send it base64-encoded in the `PAYMENT-SIGNATURE` header per the x402 v2 HTTP transport specification.

The scheme-specific `payload` is the origin-chain family's standard signed authorization, redirected to the deposit address, plus binding fields:

```jsonc
{
  "x402Version": 2,
  "resource": { /* as in PaymentRequired */ },
  "accepted": {
    "scheme": "x402interop-evm",
    "network": "sui:mainnet",
    /* ... full PaymentRequirements ... */
  },
  "payload": {
    "authorization": {
      /* family-specific signed transfer */
    },
    "binding": {
      "quoteId": "<same as requirements>",
      "depositAddress": "<same as requirements>",
      "nonce": "<unique>",
      "expiresAt": "<same or earlier than requirements>",
    },
  },
  "extensions": { /* optional, echoed as appropriate */ }
}
```

The binding ties the signature to one quote, one deposit address, one nonce, and an expiry, so the facilitator cannot redirect funds (trust-minimization requirement of x402). The `accepted` field must match the chosen entry from `PaymentRequired.accepts`.

## 6. Verify

The facilitator MUST follow the x402 v2 facilitator interface (`POST /verify`) with `VerifyRequest` containing `x402Version`, `paymentPayload`, `paymentRequirements`. For `x402interop-*` schemes it MUST additionally check:

1. `scheme` and `network` are supported (`/supported`).
2. The quote exists, is unexpired, and was minted by this facilitator for this resource.
3. `depositAddress` and amounts in the payload match the quote exactly.
4. The family-specific signature is valid, the nonce is unused, and the buyer has sufficient balance on the origin chain.
5. `refundTo` equals the buyer's origin-chain address.
6. Per-buyer and per-seller exposure limits are not exceeded (for `on_deposit` mode).

## 7. Settle

The facilitator MUST follow the x402 v2 facilitator interface (`POST /settle`) with `SettleRequest` containing `x402Version`, `paymentPayload`, `paymentRequirements`. For `x402interop-*` schemes it MUST additionally:

1. Submit the signed origin-chain transfer (the facilitator pays origin gas; the buyer pays none). **(hypothesis, per-chain)**
2. Wait for origin confirmation, then (optionally) notify 1Click of the deposit with the transaction hash.
3. Start status tracking. Emit events: `deposit_seen`, `processing`, `success`, `refunded`, `failed`.
4. Return a receipt containing quote id, origin tx hash, and (when available) destination tx hash. The `SettleResponse` MUST conform to x402 v2. For HTTP transport, settlement results may be communicated via the `PAYMENT-RESPONSE` header as per x402 v2.

Settlement response by delivery mode:

- `on_deposit`: success returned when the origin deposit is confirmed.
- `on_success`: success returned only when the swap succeeds.
- `pending_push`: immediate "pending" with a status URL; final result pushed to the seller.

## 8. Refunds

- If the swap ends in a failed or refunded state, 1Click returns funds to `refundTo` on the origin chain.
- The facilitator records the outcome, notifies the seller, and marks the receipt `refunded`.
- Replays of the same payload after a refund MUST be rejected.

## 9. Adapter notes (per buyer family)

| Family    | Origin authorization                                                                                             | Status                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| EVM       | Token transfer authorization (for example EIP-3009 where the token supports it) with recipient = deposit address | Core target; confirm per token                          |
| Solana    | Partially signed transfer transaction to the deposit address                                                     | To design                                               |
| Sui       | Follow the Sui `exact` scheme in the x402 spec repository, recipient = deposit address                           | To design                                               |
| TON       | Follow the TON scheme in the x402 spec, recipient = deposit address                                              | To design                                               |
| NEAR      | NEP-366 signed delegate `ft_transfer` (USDC), relayer pays gas, recipient = deposit address                      | To design; existing facilitator code can be reused      |
| XRPL      | Payment to the deposit address                                                                                   | Spec to be reviewed                                     |
| Tron      | No x402 support found                                                                                            | Open                                                    |
| Lightning | Lightning invoice paid for top-up credit; proof is the payment preimage (L402-style)                             | Facilitator-run node; credit spendable after swap lands |

Robinhood Chain and Ethereum mainnet: confirm that the target stablecoin supports signed transfer authorizations before enabling.

## 10. Credit accounts (Intents balance and Lightning)

For path 2 and path 3 the buyer holds credit. Per-request payments are buyer-signed vouchers bound to seller, amount, nonce, and expiry; the facilitator can only spend vouchers the buyer signed. Voucher format is TBD and should be modeled on existing x402 deferred or batch settlement schemes where possible.

## 11. Security requirements

See [SECURITY.md](../docs/SECURITY.md). At minimum: single-use deposit addresses, exact-match checks, nonce and replay protection, expiry enforcement, refund-address validation, and exposure caps.

## 12. Open questions

- Exact header and payload names for the targeted x402 version.
- Voucher format for credit accounts.
- Whether to publish the scheme to the official x402 spec repository as a proposal.
- Per-token support for gasless transfer authorizations on each EVM chain.
