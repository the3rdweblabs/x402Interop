<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Facilitator guide

Run a facilitator that verifies and settles x402interop payments over NEAR Intents.

## Create the facilitator

```ts
import { createFacilitatorServer } from '@x402interop/facilitator'

const server = await createFacilitatorServer({
  intentsClient: new MockOneClickClient(), // or HttpOneClickClient / ResilientOneClickClient
  store: new FileStore('./data/facilitator-store.json'),
  marketplaceFees: {
    registration: [
      { network: 'eip155:8453', asset: 'usdc', amount: '100000', treasury: '0xtreasury' },
    ],
  },
})

server.listen(4030)
```

## Exposed endpoints

| Endpoint              | Method   | Purpose                                   |
| --------------------- | -------- | ----------------------------------------- |
| `/health`             | GET      | Service health                            |
| `/supported`          | GET      | Supported kinds (scheme × network matrix) |
| `/verify`             | POST     | Verify a payment payload                  |
| `/settle`             | POST     | Settle a verified payment                 |
| `/interop/quote`      | POST     | Mint a 1Click quote per request           |
| `/interop/status/:id` | GET      | Quote status                              |
| `/mcp`                | POST/GET | MCP discovery and payment tools           |
| `/mcp/tools`          | GET      | List MCP tools                            |

## Configuration

The canonical template is `apps/facilitator/.env.example`. Copy it to `apps/facilitator/.env`. Key variables:

| Variable                      | Purpose                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `FACILITATOR_PORT`            | HTTP listen port; defaults to `4020`                                                                      |
| `X402INTEROP_API_KEYS`        | Comma-separated `apiKey=owner` marketplace credentials                                                    |
| `MARKETPLACE_FEES_JSON`       | Paid listing fees with treasury addresses and atomic amounts                                              |
| `MARKETPLACE_FREE_LISTINGS`   | Set `true` to allow free listings during testing; cannot be combined with paid fees                       |
| `FACILITATOR_STORE_PATH`      | Local dev store path; PostgreSQL in production                                                            |
| `DATABASE_URL`                | PostgreSQL connection string for production persistence                                                   |
| `X402INTEROP_INTENTS_CLIENT`  | `mock`, `simulator`, `live`, `sdk`, or `auto`. `simulator` needs no API key. `mock` is the local default. |
| `ONECLICK_API_KEY`            | Server-side 1Click partner key; never browser-exposed                                                     |
| `SLIPPAGE_BPS`                | Slippage tolerance sent to 1Click, in basis points. Default `100` (1%)                                    |
| `PUBLIC_FACILITATOR_URL`      | Browser-safe facilitator URL used by the marketplace                                                      |
| `RATE_LIMIT_WINDOW_MS`        | Rate-limit window for quote/verify/settle                                                                 |
| `RATE_LIMIT_MAX`              | Requests per window per client; empty disables                                                            |
| `EXPOSURE_LIMIT_PER_BUYER`    | Atomic-unit `on_deposit` cap per buyer, per network+asset                                                 |
| `EXPOSURE_LIMIT_PER_SELLER`   | Atomic-unit `on_deposit` cap per seller, per network+asset                                                |
| `EXACT_FAMILIES`              | Comma-separated `sui`, `svm`, `near`, `stellar`; only configured families are advertised                  |
| `RPC_URL_SUI_MAINNET`         | Sui gRPC endpoint used by the exact verifier/settler                                                      |
| `RELAYER_KEY_SOLANA_MAINNET`  | Solana fee-payer key for exact settlement                                                                 |
| `NEAR_RELAYER_ACCOUNT_ID`     | NEAR relayer account for sponsored exact settlement                                                       |
| `RELAYER_KEY_NEAR_MAINNET`    | NEAR relayer secret key                                                                                   |
| `RPC_URL_STELLAR_MAINNET`     | Stellar Soroban RPC endpoint                                                                              |
| `RELAYER_KEY_STELLAR_MAINNET` | Stellar fee-bump signer secret                                                                            |

`DATABASE_URL` is used when `FACILITATOR_STORAGE=postgres` (the production default). The app runs the migrations at startup and uses the PostgreSQL store for quotes, deposit mappings, consumed nonces, and marketplace listings. `FACILITATOR_STORE_PATH` selects the file store for local development.

Non-EVM families use `exact`; EVM keeps `x402interop-evm`. `/supported` only lists a family when its RPC and signer are configured. Exact supports `on_deposit`, `on_success`, and `pending_push`; `on_deposit` is deliverable when the origin deposit is seen, the other modes wait for `SUCCESS`. Refund state is exposed on `/interop/status/:id`; 1Click refunds to `refundTo` automatically. Rate limits and exposure caps are in-process and need a shared store for multi-instance deployments.

## Rollout plan

1. **Single corridor, small amounts** - for example Base to Sui. No NEAR Intents testnet exists, so use real funds in tiny amounts.
2. Measure settlement times and failures; fill the [test report](/reference/test-report).
3. Add corridors one at a time, confirming each with `GET /v0/tokens` first.
4. Enable discovery crawling and registration.
5. Enable credit paths (Intents balance, then Lightning) with low caps.
