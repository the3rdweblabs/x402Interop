<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Deployment

How to run the x402interop facilitator.

## Components to run

1. Facilitator service (HTTP API, quote router, status tracker).
2. Database for quotes, receipts, credit accounts, and discovery entries.
3. Background workers: status polling, webhook delivery, catalog crawling, health probes.
4. Optional: Lightning node or service and a rebalancing worker.
5. Optional: relayer wallets that pay origin-chain gas for gasless payments.

## Prerequisites

- A NEAR Intents 1Click API key (JWT) from the partner portal. Unauthenticated use works but incurs a 0.2% fee.
- Access to origin-chain RPC endpoints for each enabled corridor.
- Funded relayer wallets (small balances) on each origin chain where the facilitator pays gas.
- A domain with TLS for the public endpoint and webhooks.

## Configuration

The canonical template is `apps/facilitator/.env.example`. Copy it to `apps/facilitator/.env`; the facilitator start script loads that file automatically with Node's `--env-file-if-exists`. Production deployments should inject the same variables through the platform's secret/configuration manager. Discovery only needs the marketplace's browser-safe `PUBLIC_FACILITATOR_URL`.

Each service owns its env file:

- `apps/facilitator/.env`
- `apps/marketplace/.env`
- `apps/interop/.env` (optional, public URL only)
- `examples/live-canary/.env`
- `examples/resource/.env`
- `examples/agent/.env`
- `tests/.env` (shared test key only)

Start the local Postgres with the facilitator env file:

```sh
docker compose --env-file apps/facilitator/.env up -d --wait
```

| Variable                      | Purpose                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FACILITATOR_PORT`            | HTTP listen port; defaults to `4020`                                                                                                             |
| `X402INTEROP_API_KEYS`        | Comma-separated `apiKey=owner` marketplace credentials                                                                                           |
| `FACILITATOR_STORE_PATH`      | Local development store path; use PostgreSQL in production                                                                                       |
| `MARKETPLACE_FEES_JSON`       | JSON fee configuration with treasury addresses and atomic amounts                                                                                |
| `MARKETPLACE_FREE_LISTINGS`   | Set `true` to allow free listings during testing; cannot be combined with `MARKETPLACE_FEES_JSON`                                                |
| `DATABASE_URL`                | PostgreSQL connection string for production persistence                                                                                          |
| `X402INTEROP_INTENTS_CLIENT`  | `mock`, `simulator`, `live`, `sdk`, or `auto`. `mock` and `simulator` stay on this machine. `live`, `sdk`, and `auto` require `ONECLICK_API_KEY` |
| `ONECLICK_API_KEY`            | Server-side 1Click partner key; never expose it to browsers. Not used by `mock` or `simulator`                                                   |
| `SLIPPAGE_BPS`                | Slippage tolerance sent to 1Click, in basis points. Default `100` (1%)                                                                           |
| `FACILITATOR_CORS_ORIGINS`    | Browser origins allowed to call the facilitator. Unset allows the local marketplace and docs site; empty disables CORS                           |
| `RATE_LIMIT_WINDOW_MS`        | Rate-limit window for quote/verify/settle; defaults to `60000`                                                                                   |
| `RATE_LIMIT_MAX`              | Requests per window per client; leave empty to disable                                                                                           |
| `EXPOSURE_LIMIT_PER_BUYER`    | Atomic-unit `on_deposit` exposure cap per buyer, per network+asset                                                                               |
| `EXPOSURE_LIMIT_PER_SELLER`   | Atomic-unit `on_deposit` exposure cap per seller, per network+asset                                                                              |
| `EXACT_FAMILIES`              | Comma-separated exact families to load: `sui`, `svm`, `near`, `stellar`. Only configured families are advertised                                 |
| `RPC_URL_SUI_MAINNET`         | Sui gRPC endpoint used by the exact verifier/settler                                                                                             |
| `RPC_URL_SOLANA_MAINNET`      | Solana RPC endpoint used by the SVM exact signer                                                                                                 |
| `RPC_URL_NEAR_MAINNET`        | NEAR RPC endpoint used by the NEAR exact signer                                                                                                  |
| `RPC_URL_STELLAR_MAINNET`     | Stellar Soroban RPC endpoint; required for Stellar exact                                                                                         |
| `RELAYER_KEY_SOLANA_MAINNET`  | Solana fee-payer key for exact settlement; leave empty to keep SVM off                                                                           |
| `NEAR_RELAYER_ACCOUNT_ID`     | NEAR relayer account for sponsored exact settlement                                                                                              |
| `RELAYER_KEY_NEAR_MAINNET`    | NEAR relayer secret key; leave empty to keep NEAR off                                                                                            |
| `RELAYER_KEY_STELLAR_MAINNET` | Stellar fee-bump signer secret; leave empty to keep Stellar off                                                                                  |

`DATABASE_URL` is the PostgreSQL connection string used when `FACILITATOR_STORAGE=postgres` (required when `NODE_ENV=production`). The facilitator runs the SQL migrations at startup and stores quotes, deposit mappings, consumed nonces, and marketplace listings in PostgreSQL. `FACILITATOR_STORE_PATH` selects the JSON file store for local development. `MARKETPLACE_FREE_LISTINGS=true` is a testing switch; switch it off and configure paid fees before opening listings publicly. `PUBLIC_FACILITATOR_URL` belongs to `apps/marketplace/.env`, not this file. The names under "Names kept, not read" in the example, including `REDIS_URL` and `BACKUP_BUCKET`, are not loaded by the process.

## Exact non-EVM rails

Sui, Solana, NEAR, and Stellar use the standard `exact` scheme. EVM keeps the existing `x402interop-evm` quote-binding path. `/supported` only advertises a family when its RPC and signer are configured.

- **Sui** needs only `RPC_URL_SUI_MAINNET`; the buyer signs a complete transaction and the facilitator dry-runs and executes it over gRPC.
- **Solana** needs a fee-payer key in `RELAYER_KEY_SOLANA_MAINNET` and a small SOL balance.
- **NEAR** needs `NEAR_RELAYER_ACCOUNT_ID` plus a funded relayer key in `RELAYER_KEY_NEAR_MAINNET`.
- **Stellar** needs a mainnet Soroban RPC URL and a funded fee-bump signer in `RELAYER_KEY_STELLAR_MAINNET`.

Exact non-EVM supports `on_deposit`, `on_success`, and `pending_push`:

- `on_deposit`: `settle` is deliverable as soon as the origin deposit is seen, or after the exact origin transaction executes.
- `on_success`: deliverable only after 1Click reports `SUCCESS`.
- `pending_push`: the seller should return `202` and poll `/interop/status/:id`; deliverable only after success.
- Refunds are automatic on the 1Click path to the quote's `refundTo`; `/interop/status/:id` exposes the refund state and address. Exact payments are non-custodial and refund on the origin chain.
- Rate limits and exposure caps are in-process. Use a shared store such as Redis before running multiple facilitator instances.

### Corridor caveats

- **NEAR destination:** 1Click now quotes a direct `DESTINATION_CHAIN` transfer to an existing `.near` account, and x402Interop always uses that route. The recipient account must exist; the direct quote includes a withdrawal fee for the final `ft_transfer`. NEAR as an origin is not quoted.
- **BNB Chain:** 1Click applies a temporary minimum swap amount. On 5 November 2026 the API advertised $1,000; $1,000 and $1,000.01 failed, while $1,001 quoted in both directions. Do not hardcode the threshold; surface 1Click's error and re-test. The x402 catalogue lists only BNB native on `eip155:56`, so a BSC stablecoin is not a seller asset until a catalogue row is added.
- **Stellar:** a destination needs a USDC trustline; Stellar as an origin currently fails with `Incorrect depositMode`.
- **Monad:** 1Click returns `Internal server error`.
- Check the [1Click route matrix](/reference/oneclick-route-matrix) before adding a corridor. The [1Click swap lifecycle](/reference/oneclick-swap-lifecycle) documents the quote, deposit, status, and refund sequence.

Seller-side `PAYMENT_REQUIRED_BODY=auto` is the default: browsers get the full JSON requirements in the body, while API clients get the minimal x402.org-style `{"error":"Payment required"}` body. `json` forces full JSON for every client, `error` forces minimal, and `empty` omits the body. The full requirements are always in the `PAYMENT-REQUIRED` header.

There is no NEAR Intents testnet; every live send is a real mainnet transfer.

## Rollout plan

1. **Single corridor, small amounts.** For example Base to Sui. There is no NEAR Intents testnet, so use real funds in tiny amounts.
2. Measure settlement times and failures; fill TEST_REPORT.
3. Add corridors one at a time, confirming each with `GET /v0/tokens` first.
4. Enable discovery crawling and registration.
5. Enable credit paths (Intents balance, then Lightning) with low caps.

## Monitoring

- Quote mint rate, success rate, and median/p95 settlement time per corridor.
- Refund and failure rate.
- Stuck swaps older than the quote `timeEstimate` plus a safety margin.
- Relayer balances and gas spend.
- Webhook delivery failures.

## Backups and recovery

- Back up the database regularly; receipts and quote records are the audit trail.
- On restart, workers must resume polling all non-terminal swaps.
- Document key rotation and incident response before going live.

## Hostnames and local HTTPS

Four sites, one set of routes in production and locally:

| Site | Production | Local (through Caddy) |
|---|---|---|
| Main project site | `x402interop.xyz` | `x402interop.localhost:8443` |
| Marketplace | `marketplace.x402interop.xyz` | `marketplace.x402interop.localhost:8443` |
| Docs | `docs.x402interop.xyz` (served from `/docs`) | `docs.x402interop.localhost:8443` |
| Facilitator API | `facilitator.x402interop.xyz` | `facilitator.x402interop.localhost:8443` |

`*.localhost` names resolve to your own machine in current browsers, so local HTTPS needs no DNS or hosts-file change. Each app keeps its own `.env.example`. Copy it to `.env` and use the local values.

**Run the local edge.** The proxy container reaches your services through the Docker host, so the marketplace and docs previews must listen on all interfaces:

```sh
pnpm --filter marketplace build && pnpm --filter marketplace preview:proxy
pnpm --filter interop build && pnpm --filter interop preview:proxy
docker compose --profile proxy up -d
```

**Trust the local certificate once.** Caddy signs local sites with its own root, so the browser warns until you trust it:

```sh
docker cp x402interop-proxy:/data/caddy/pki/authorities/local/root.crt ./caddy-local-root.crt
```

Install that file in your operating system or browser trust store. Delete it afterwards if you don't need it.

**Restart the facilitator with the local origins.** It reads `FACILITATOR_CORS_ORIGINS` and `MARKETPLACE_DOMAIN` from its `.env`, so set the local values from `apps/facilitator/.env.example` and restart it. Until then, the marketplace cannot call it from its local HTTPS origin.

**Check the local edge.** The Astro apps inline `PUBLIC_*` at build time, so the marketplace and the docs site must be built from the local values in their `.env.example` files, not from `127.0.0.1` ports. The facilitator must allow `https://marketplace.x402interop.localhost:8443`.

```sh
pnpm --filter facilitator start
pnpm --filter marketplace build && pnpm --filter marketplace preview:proxy
pnpm --filter interop build && pnpm --filter interop preview:proxy
docker compose --profile proxy up -d
curl -kI https://x402interop.localhost:8443/
curl -kI https://marketplace.x402interop.localhost:8443/
curl -kI https://docs.x402interop.localhost:8443/
curl -kI https://facilitator.x402interop.localhost:8443/health
curl -kI https://x402interop.localhost:8443/docs
```

The first four answers are `200`. The last is `301` to `https://docs.x402interop.localhost:8443/docs`. The docs root itself opens `/docs/intro`. Trust Caddy's local root, as above, or `curl -k` will warn and the browser will too.

**Production, once `x402interop.xyz` has DNS.** `deploy/Caddyfile.production` serves the built sites from disk and reverse-proxies the facilitator. Set `ACME_EMAIL` and the three build roots in the deploy environment, and point DNS for all four hosts at the server. Leave that file in place even if the domain is not registered yet.

**Railway, using Railway's own hostnames.** `deploy/Caddyfile.railway` is the same four sites. Railway's edge already terminates TLS and sets `PORT`, so this file does not request a certificate and does not mention `x402interop.xyz`. Run Caddy as one service. Keep the interop app, the marketplace, and the facilitator as private services in the same project, and set:

| Variable | Example |
|---|---|
| `SITE_HOST` | the Caddy service's `*.up.railway.app` name, no scheme |
| `DOCS_HOST` | docs name attached to that same service |
| `MARKETPLACE_HOST` | marketplace name attached to that same service |
| `FACILITATOR_HOST` | facilitator name attached to that same service |
| `INTEROP_UPSTREAM` | `interop.railway.internal:8080` |
| `MARKETPLACE_UPSTREAM` | `marketplace.railway.internal:8080` |
| `FACILITATOR_UPSTREAM` | `facilitator.railway.internal:8080` |

Rebuild the Astro apps with `https://` plus those hosts (`PUBLIC_SITE_URL`, `PUBLIC_DOCS_URL`, `PUBLIC_FACILITATOR_URL`, `PUBLIC_MARKETPLACE_URL`). Set `FACILITATOR_CORS_ORIGINS` to `https://` plus `MARKETPLACE_HOST`. Railway only sends a hostname to this container when the hostname is attached to the Caddy service. Another service's generated `*.up.railway.app` name stays on that service. Attach all four public names to the Caddy service, or publish each app on its own Railway URL and do not put this file in front.
