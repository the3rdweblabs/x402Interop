<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS"
-->

# x402Interop

**Pay on the chain you already use. Get paid on the chain you already use. Discover services across all of them.**

```ts
import { x402interop } from '@x402interop/express'

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

> **Status: early scaffold.** Types, app shells, and docs are in place. Chain verification, 1Click calls, and discovery crawling are not. API shapes are drafts. Claims that still need measuring are marked **(hypothesis)** in the design notes.

Built by [The3rdWebLabs](https://github.com/the3rdweblabs), a Nigerian open-source Web3 R&D studio. [X](https://x.com/the3rdweblabs) · [LinkedIn](https://linkedin.com/company/the3rdweblabs)

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
- While a swap is in flight, funds are custodied by NEAR Intents. That is not a trustless path. See [docs/SECURITY.md](docs/SECURITY.md).

## Ecosystem

| Path                  | Package                                                                      | Role                                                    |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/core`       | `@x402interop/core`                                                          | x402 v2 types, `extensions.x402interop`, `ChainAdapter` |
| `packages/schemes`    | `@x402interop/schemes`                                                       | Scheme ids and the quote binding                        |
| `packages/intents`    | `@x402interop/intents`                                                       | Typed 1Click client (no live calls yet)                 |
| `packages/quote`      | `@x402interop/quote`                                                         | Path choice and payment requirements                    |
| `packages/status`     | `@x402interop/status`                                                        | Swap state and receipts                                 |
| `packages/facilkit`   | `@x402interop/facilkit`                                                      | Verify, settle, and supported helpers                   |
| `packages/adapters/*` | `@x402interop/evm`, `svm`, `sui`, `near`, `ton`, `tron`, `xrpl`, `lightning` | Buyer-family stubs                                      |
| `packages/discovery`  | `@x402interop/discovery`                                                     | Service index                                           |
| `packages/client`     | `@x402interop/client`                                                        | Buyer client                                            |
| `packages/express`    | `@x402interop/express`                                                       | Seller middleware                                       |
| `packages/mandate`    | `@x402interop/mandate`                                                       | Spend policy                                            |
| `apps/facilitator`    | private                                                                      | `/verify`, `/settle`, `/supported`                      |
| `apps/discovery`      | private                                                                      | Search and register                                     |
| `apps/mcp`            | private                                                                      | Agent tools                                             |
| `apps/explorer`       | private                                                                      | Corridor and receipt shell                              |

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

| Doc                                                  | Purpose                                             |
| ---------------------------------------------------- | --------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)         | Components, flows, and design decisions             |
| [specs/SCHEME_SPEC.md](specs/SCHEME_SPEC.md)         | Scheme payload, verify, settle, refund (draft v0.1) |
| [specs/FACILITATOR_API.md](specs/FACILITATOR_API.md) | Endpoint reference                                  |
| [docs/SELLER_GUIDE.md](docs/SELLER_GUIDE.md)         | Integrating as a seller                             |
| [docs/AGENT_MCP_GUIDE.md](docs/AGENT_MCP_GUIDE.md)   | Integrating as an agent                             |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)           | Product walkthrough of a cross-chain payment        |
| [docs/SECURITY.md](docs/SECURITY.md)                 | Trust model                                         |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)             | Running the facilitator                             |
| [docs/PROJECT_NOTES.md](docs/PROJECT_NOTES.md)       | Research notes                                      |
| [ROADMAP.md](ROADMAP.md)                             | What comes next                                     |
| [AGENTS.md](AGENTS.md)                               | Notes for coding agents                             |
| [CONTRIBUTING.md](CONTRIBUTING.md)                   | How to contribute                                   |

## Development

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

`pnpm --filter facilitator start` listens on port 4020. Discovery uses 4021 and the explorer uses 4022. Copy `.env.example` when you need endpoints. Do not commit keys.

## Licence

GNU GPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
