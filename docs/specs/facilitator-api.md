<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Facilitator API

Standard x402 endpoints plus `/interop` extensions.

## Endpoints

| Endpoint                    | Method   | Purpose                                                                                                            |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `/health`                   | GET      | Service health                                                                                                     |
| `/supported`                | GET      | Supported kinds (scheme × network matrix)                                                                          |
| `/verify`                   | POST     | Verify a payment payload                                                                                           |
| `/settle`                   | POST     | Settle a verified payment                                                                                          |
| `/interop/quote`            | POST     | Mint a 1Click quote per request                                                                                    |
| `/interop/status/:id`       | GET      | Quote status                                                                                                       |
| `/interop/simulate/deposit` | POST     | Mock and simulator only. Records a deposit and advances that quote to `SUCCESS`. The route is absent in live mode. |
| `/mcp`                      | POST/GET | MCP discovery and payment tools                                                                                    |
| `/mcp/tools`                | GET      | List MCP tools                                                                                                     |

## `/supported`

Returns the `SupportedResponse` shape:

```json
{
  "kinds": [ { "x402Version": 2, "scheme": "x402interop-evm", "network": "eip155:8453" }, … ],
  "extensions": ["x402interop"],
  "signers": {}
}
```

`kinds` is generated from `supportedKinds()`. A kind is listed only when the facilitator can verify an origin proof for that scheme. Today that is `x402interop-evm` on the EVM networks. Aptos, Stellar, Starknet, UTXO, and the other interop families are registered and fail closed (`not_implemented`, or that family's own closed reason). They are omitted from `/supported`.

## `/interop/simulate/deposit`

```json
{ "quoteId": "…", "txHash": "0x…" }
```

Available only when `X402INTEROP_INTENTS_CLIENT` is `mock` or `simulator`. A valid call records the deposit and sets the quote status to `success`. In `live`, `sdk`, and `auto` the path is not registered and responds `404`. A signed EVM payment posted to `/verify` or `/settle` records the same simulated deposit after the EIP-712 proof checks, so a buyer does not have to call this route.

## MCP tools

`POST /mcp` implements `search_services`, `get_service`, `prepare_payment`, `pay_and_fetch`, `payment_status`, and `get_credit`. The server does not accept a buyer private key. `prepare_payment` returns a quote. The caller signs it and passes `paymentPayload` plus `paymentRequirements` to `pay_and_fetch`. `get_credit` returns zero spendable and zero pending because the facilitator does not hold a balance.

## `/verify` + `/settle`

Verify checks the binding, expiry, and (for interop schemes) the cross-chain deposit status. Settle returns `originTxHash` on success.

## `/interop/quote`

Mints a 1Click quote through `@x402interop/intents` and returns the quote binding (quoteId, depositAddress, nonce, expiresAt) plus the `x402interop` extension.

The seller is always the final recipient: the quote uses `recipientType: DESTINATION_CHAIN` for every network, including `near:mainnet`. 1Click performs the last-mile withdrawal to the seller address. There is no facilitator option to substitute a NEAR Intents balance for the merchant's wallet.
