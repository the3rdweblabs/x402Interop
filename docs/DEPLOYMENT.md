<!--
provenance: "native"
copyright: "2026 The3rdWebLabs"
-->

# Deployment notes (DRAFT)

How to run the x402interop facilitator. Names of variables and scripts are proposals.

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

## Configuration (proposed environment variables)

| Variable                    | Purpose                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `ONE_CLICK_API_URL`         | 1Click API base URL                                                         |
| `ONE_CLICK_JWT`             | 1Click partner key (server-side only)                                       |
| `DATABASE_URL`              | Persistent store                                                            |
| `ENABLED_CORRIDORS`         | List of origin to destination pairs, for example `eip155:8453->sui:mainnet` |
| `RELAYER_KEYS_*`            | Per-chain relayer keys (use a secrets manager)                              |
| `RPC_URL_*`                 | Per-chain RPC endpoints                                                     |
| `EXPOSURE_LIMIT_PER_BUYER`  | Cap for `on_deposit` mode                                                   |
| `EXPOSURE_LIMIT_PER_SELLER` | Cap for `on_deposit` mode                                                   |
| `WEBHOOK_SIGNING_SECRET`    | Signs outgoing webhooks                                                     |
| `LIGHTNING_*`               | Node or service connection settings                                         |

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
