<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# x402Interop

**Pay on the chain you already use. Get paid on the chain you already use. Discover services across all of them.**

## Start here

- **[Read the documentation](docs/README.mdx)** for integration and architecture guides.
- **[Run the mainnet canary](examples/live-canary/README.md)** for a tiny real quote/settlement check.
- **[Enter the marketplace](https://x402interop-marketplace.up.railway.app/)** to discover or register x402interop-enabled services.
- **[Run the protected resource](examples/resource/README.md)**. This is the seller. `MODE=test` quotes in-process and serves two reports, Sui USDC and NEAR USDC, with no mainnet spend. `MODE=live` uses 1Click and pays the seller addresses you set. Each report is 0.15 USDC.
- **[Run the paying agent](examples/agent/README.md)**. This is the buyer, one Base wallet, talking only to that resource. `list` and `buy` need no model. `chat` is the interactive session. `MODE=live` with `CONFIRM_SPEND=true` sends real Base USDC.

```ts
import { x402interop } from '@x402interop/servers/express'

app.use(
  '/api/premium',
  x402interop({
    facilitator: 'https://facilitator.example.com',
    payTo: '<your address on your chain>',
    network: 'sui:mainnet',
    asset: '<your stablecoin id>',
    price: '0.05',
    amount: '50000',
    deliveryMode: 'on_deposit',
  }),
)
```

x402Interop is an open-source interoperability layer for the x402 agent-payment economy. A buyer agent pays on the chain it already uses, the seller is paid on its own chain, and agents discover x402 services across chains. Cross-chain settlement goes through [NEAR Intents](https://docs.near-intents.org) (1Click API).

> **Status: implementing.** The type surface, six packages, all twelve interop families, the 26-chain/74-asset catalogue, spec-native `exact` implementations, the facilitator kit, and the framework servers are in place. Standard `exact` paths delegate to the upstream `@x402/*` packages or to spec-native implementations. The seller middleware calls the facilitator's `/verify`, then `/settle`, and only then serves the resource. If the facilitator cannot be reached, the response is `402` with `retryable: true`. NEAR Intents quoting runs through REST and the official SDK. The marketplace is an Astro app over the facilitator.
>
> EVM interop verifies an EIP-712 quote binding with no node client. SVM, NEAR, and Sui verify when the caller supplies a node client. The other families stay `not_implemented`. `/supported` still lists only `x402interop-evm`, because the hosted facilitator does not construct those clients yet. Exact non-EVM rails are wired for Sui, Solana, NEAR, and Stellar; only families with a configured RPC and signer are advertised. Aptos, Starknet, TON, TRON, XRPL, and UTXO remain fail-closed where no signer is configured.

## Installation

<details>
<summary>TypeScript (pnpm)</summary>

Node.js 22 or newer and pnpm 11.5.0.

```sh
pnpm install
pnpm build
```

Packages publish as `@x402interop/*` (the npm scope is lowercase). Nothing is on the registry yet. Inside this repo, depend on them with `workspace:*`.

</details>

## Principles

- A buyer pays from a wallet it already has. A seller is paid on the chain it already uses.
- No facilitator float. The facilitator never fronts its own liquidity.
- Same-chain x402 payments keep working. x402interop is the cross-chain path.
- The 1Click API key stays on the server. It must never appear in a 402 response.
- While a swap is in flight, funds are custodied by NEAR Intents. That is not a trustless path. See [docs/reference/security.md](docs/reference/security.md).

## Ecosystem

| Path                | Package                 | Role                                                 |
| ------------------- | ----------------------- | ---------------------------------------------------- |
| `packages/core`     | `@x402interop/core`     | x402 v2 types, `x402interop-*` ids, catalogues       |
| `packages/adpt`     | `@x402interop/adpt`     | Interop mechanisms per chain family + manifests      |
| `packages/intents`  | `@x402interop/intents`  | 1Click REST + SDK clients, failover, quote lifecycle |
| `packages/facilkit` | `@x402interop/facilkit` | Facilitator kit: store, status, MCP, supported kinds |
| `packages/client`   | `@x402interop/client`   | createInteropClient, wrapFetchWithInterop, signers   |
| `packages/servers`  | `@x402interop/servers`  | Seller middleware: ./express ./hono ./fastify ./next |
| `apps/facilitator`  | private                 | Thin HTTP shell over facilkit; MCP via /mcp          |
| `apps/marketplace`  | private                 | Marketplace over the facilitator                     |

## Coverage

- The catalogue lists the day-one networks in [docs/reference/chains-and-assets.md](docs/reference/chains-and-assets.md). The EVM interop path verifies a real EIP-712 quote binding. Aptos, Stellar, Starknet, and UTXO verify and settle return `not_implemented` and fail closed.
- Official x402 scheme specs are mirrored under [docs/specs/schemes/](docs/specs/schemes/README.md).
- Intents transport is both the 1Click REST API and the official SDK, with failover.
- `exact` is implemented spec-native for Sui, Starknet, and Lightning, where only a spec exists.
- TRON and the UTXO (Bitcoin-family) chains are interop-only; no third-party scheme packages.

## Choosing a path

| Path                      | When          | What happens                                                                                                                                  |
| ------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Deposit address (default) | Most payments | The buyer signs a gasless payment on its own chain to a single-use 1Click deposit address. The seller receives the exact amount on its chain. |
| Intents balance           | Repeat buyers | The buyer deposits once. Later payments start from the Intents balance and skip origin-chain confirmation.                                    |
| Lightning top-up          | BTC payers    | The invoice settles in seconds. Credit becomes spendable after the background swap lands.                                                     |

The minimum launch set, if scope must shrink, is **Base, Solana, NEAR, and Sui**, plus Bitcoin as payer-only. Confirm chain support with `GET /v0/tokens` before enabling a corridor. There is no NEAR Intents testnet.

## Terms

- **Buyer** holds funds on the origin chain and signs the payment.
- **Seller** wants payment on the settlement network named in `PaymentRequirements.network`.
- **Scheme id** names the buyer's chain family (`x402interop-evm`, `x402interop-tvm` for TON, and so on).
- **Delivery mode** is the seller's choice: `on_deposit`, `on_success`, or `pending_push`.

## Documentation

| Doc                                                                                | Purpose                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| [docs/specs/scheme.md](docs/specs/scheme.md)                                       | Scheme payload, verify, settle, refund (draft v0.1) |
| [docs/specs/facilitator-api.md](docs/specs/facilitator-api.md)                     | Endpoint reference                                  |
| [docs/guides/seller.mdx](docs/guides/seller.mdx)                                   | Integrating as a seller                             |
| [docs/guides/mcp.md](docs/guides/mcp.md)                                           | Integrating as an agent                             |
| [docs/guides/walkthrough.md](docs/guides/walkthrough.md)                           | Product walkthrough of a cross-chain payment        |
| [docs/guides/live-canary.md](docs/guides/live-canary.md)                           | Mainnet micro-settlement canary and the 402 body    |
| [docs/reference/oneclick-route-matrix.md](docs/reference/oneclick-route-matrix.md) | Tested 1Click route combinations                    |
| [docs/guides/http2.md](docs/guides/http2.md)                                       | HTTP/2 and HTTP/3 edge setup                        |
| [docs/reference/security.md](docs/reference/security.md)                           | Trust model                                         |
| [docs/guides/deployment.md](docs/guides/deployment.md)                             | Running the facilitator                             |
| [docs/internal/project-notes.md](docs/internal/project-notes.md)                   | Research notes                                      |
| [ROADMAP.md](ROADMAP.md)                                                           | What comes next                                     |
| [AGENTS.md](AGENTS.md)                                                             | Notes for coding agents                             |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                 | How to contribute                                   |

## Development

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

The EVM signing tests use one unfunded key. Create `tests/.env` from the example before
running the full suite:

```sh
cp tests/.env.example tests/.env
node -e "console.log('X402INTEROP_TEST_PRIVATE_KEY=0x'+require('node:crypto').randomBytes(32).toString('hex'))" > tests/.env
pnpm test
```

Never fund that key. You can also pass `X402INTEROP_TEST_PRIVATE_KEY=0x... pnpm test` for
one run. When it is unset, the signing tests are skipped rather than failing the rest of
the suite; CI supplies its own unfunded key so every test runs there.

## Run the stack locally

Node.js 22 or newer and pnpm 11.5.0. Nothing here sends a mainnet transaction. Mock mode is the default. `simulator` is an in-process 1Click double and does not need `ONECLICK_API_KEY`. `live`, `sdk`, and `auto` do, and this guide does not use them.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter facilitator start
```

The facilitator listens on <http://127.0.0.1:4020>. Useful checks:

```sh
curl -sS http://127.0.0.1:4020/health
curl -sS http://127.0.0.1:4020/supported
curl -sS http://127.0.0.1:4020/marketplace/fees
curl -sS http://127.0.0.1:4020/discovery/resources
curl -sS -X POST http://127.0.0.1:4020/interop/quote \
  -H 'content-type: application/json' \
  -d '{
    "sellerNetwork": "sui:mainnet",
    "sellerAsset": "nep141:sui-c1b81ecaf27933252d31a963bc5e9458f13c18ce.omft.near",
    "sellerAddress": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "amount": "200000",
    "buyerNetwork": "eip155:8453",
    "buyerAsset": "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    "buyerAddress": "0x1111111111111111111111111111111111111111",
    "deliveryMode": "on_deposit"
  }'
curl -sS -X POST http://127.0.0.1:4020/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`amount` is the destination amount in atomic units (`200000` is 0.20 USDC). `sellerAsset` is the 1Click/Intents asset id, not the symbol. `buyerAddress` is the refund address; the placeholder above is valid for a quote-only check. The response includes `originAmount` (what the buyer pays, including the 1Click fee and slippage) and `depositAddress` (the single-use address to pay).

`GET /marketplace/fees` returns 503 until `MARKETPLACE_FEES_JSON` is set. `GET /supported` lists the interop families whose origin proof is implemented (currently `x402interop-evm`) plus any `exact` rails enabled by the environment. The other interop families are registered but fail closed, so they are not advertised. MCP `tools/call` runs the six tools against the facilitator. `pay_and_fetch` takes a signed payload and does not accept a buyer key. To exercise the simulator instead of the mock client:

```sh
X402INTEROP_INTENTS_CLIENT=simulator pnpm --filter facilitator start
```

In another terminal, build is already done, so start the two Astro apps:

```sh
pnpm --filter marketplace start
pnpm --filter interop start
```

The marketplace is <http://127.0.0.1:4321>. The docs site is <http://127.0.0.1:4322>. `localhost` on those same ports is allowed by the facilitator's default CORS list, so the marketplace can call <http://127.0.0.1:4020>. Override the list with `FACILITATOR_CORS_ORIGINS`.

For a real transport check, use [`examples/live-canary`](examples/live-canary/README.md). It quotes through 1Click and only sends mainnet funds when `CANARY_SEND=true` and `CANARY_CONFIRM=send-mainnet` are both set.

## Pay for a protected resource locally

After `pnpm install && pnpm build`, the resource and agent examples run the full `402 -> pay -> 200` loop in-process with the simulator. They need no 1Click key and no mainnet funds.

```sh
cp examples/resource/.env.example examples/resource/.env
cp examples/agent/.env.example examples/agent/.env
pnpm --filter x402interop-example-resource start
# in another terminal
pnpm --filter x402interop-example-agent start -- list
pnpm --filter x402interop-example-agent start -- buy sui-usdc-report
```

The first request returns `402` with `PAYMENT-REQUIRED`; the agent signs a payment and retries; the resource returns `200` with the report. The buyer pays from Base USDC and the seller is paid in Sui USDC. Both sides are simulated in this mode, so no funds move.

## End-to-end tests

```sh
pnpm --filter e2e test
```

## Licence

Published packages (`packages/*`) are **GNU GPL-3.0-or-later**. Hosted applications
(`apps/*`) are **GNU AGPL-3.0-or-later**. See [LICENSE](LICENSE),
[LICENSE-AGPL](LICENSE-AGPL), and [NOTICE](NOTICE) for the split.
