<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Wire format

## Canonical headers (post-reset)

| Direction                       | Header              | Notes                                 |
| ------------------------------- | ------------------- | ------------------------------------- |
| Request (buyer → seller)        | `PAYMENT-SIGNATURE` | Only accepted payment header          |
| Response (seller → buyer)       | `PAYMENT-REQUIRED`  | base64-encoded `PaymentRequired` body |
| Response (seller → buyer, paid) | `PAYMENT-RESPONSE`  | base64-encoded `SettleResponse`       |

Removed (no longer accepted or emitted): `x-payment`, `X-PAYMENT`, `x402-payment`, `X402-PAYMENT`, `x-payment-signature`, `X-PAYMENT-REQUIRED`, `X-PAYMENT-RESPONSE`.

## 402 Payment Required response

```http
HTTP/1.1 402 Payment Required
content-type: application/json; charset=utf-8
PAYMENT-REQUIRED: <base64 of the JSON body below>
payment-required: <same base64>
```

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://seller.example/report",
    "description": "x402Interop protected resource",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "x402interop-evm",
      "network": "sui:mainnet",
      "asset": "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      "amount": "200000",
      "payTo": "0x0000000000000000000000000000000000000000",
      "maxTimeoutSeconds": 300,
      "extra": {
        "quoteId": "1click-<correlationId>",
        "depositAddress": "0x…",
        "originNetwork": "eip155:8453",
        "originAsset": "nep141:base-…omft.near",
        "originAmount": "222270",
        "destinationAmount": "200000",
        "expiresAt": "2026-11-02T12:30:00.000Z",
        "recipient": "<seller address on sui:mainnet>"
      }
    }
  ],
  "extensions": {
    "x402interop": {
      "info": { "quoteId": "...", "depositAddress": "...", "recipient": "..." },
      "schema": { "type": "object" }
    }
  }
}
```

### Reading the fields

- `network` and `asset` are the **seller's** chain and on-chain asset id.
- `amount` is the exact destination output. `extra.originAmount` is what the buyer pays on the origin chain, including the 1Click spread.
- `payTo` is the single-use 1Click deposit address, **not** the seller's address. `extra.recipient` is the seller.
- `extra.refundTo` is the buyer's origin address.
- `maxTimeoutSeconds` follows the quote's payment window so it agrees with `extra.expiresAt`.
- The 1Click API key never appears in this body.

## Paid response

```http
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
PAYMENT-RESPONSE: <base64 of the SettleResponse>
```

## Interop wire shape (locked)

`payTo` is now the deposit address; the seller lives in `extra.recipient`. Existing v0 interop payloads that put the seller in `payTo` will be rejected after v1.0.0.

This shape requires an **x402interop-aware client or explorer**. `payTo` is an address on the buyer's origin chain while `network` and `asset` name the seller's chain, so a stock x402 client cannot construct a payment for it. The deposit is claimed by the origin-chain transfer to `payTo`, and 1Click carries it to `extra.recipient`.
