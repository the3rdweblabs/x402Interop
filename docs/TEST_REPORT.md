<!--
provenance: "native"
copyright: "2026 The3rdWebLabs"
-->

# Test report

**Status: template. No measurements yet.** Do not publish numbers here that were not measured. NEAR Intents has no official settlement-time guarantee and no testnet, so every figure must come from real small-value transactions.

## 1. Methodology

- Use small amounts only.
- For each corridor, run at least 20 swaps across different times of day.
- Record: quote time, `timeEstimate` from the quote, origin tx hash, time to origin confirmation, time to deposit seen by 1Click, time to swap success, destination tx hash, final status, and any refund.
- Report median, p95, and max. Note failures and refunds separately.

## 2. Corridors under test

| Corridor                              | Runs | Median (s) | p95 (s) | Max (s) | Failures | Refunds | Quote estimate (typical) |
| ------------------------------------- | ---- | ---------- | ------- | ------- | -------- | ------- | ------------------------ |
| Base to Sui                           | TBD  | TBD        | TBD     | TBD     | TBD      | TBD     | TBD                      |
| Base to NEAR                          | TBD  | TBD        | TBD     | TBD     | TBD      | TBD     | TBD                      |
| Solana to Sui                         | TBD  | TBD        | TBD     | TBD     | TBD      | TBD     | TBD                      |
| Arbitrum to Sui                       | TBD  | TBD        | TBD     | TBD     | TBD      | TBD     | TBD                      |
| Intents balance to Sui                | TBD  | TBD        | TBD     | TBD     | TBD      | TBD     | TBD                      |
| Lightning top-up to stablecoin credit | TBD  | TBD        | TBD     | TBD     | TBD      | TBD     | TBD                      |

## 3. Reference points from public sources (not our measurements)

- An integrator tool description states 30-60 seconds as typical for 1Click swaps.
- The official quickstart says to allow up to 15 minutes for cross-chain processing.
- Bitcoin on-chain origin: 45-60 minutes due to confirmations.

## 4. Functional tests

| Test                                            | Expected                                        | Result           |
| ----------------------------------------------- | ----------------------------------------------- | ---------------- |
| Gasless origin payment to deposit address (EVM) | Origin transfer accepted as a valid deposit     | TBD (hypothesis) |
| Exact-output amount delivered to seller         | Seller receives exact amount                    | TBD              |
| Quote expiry before deposit                     | Settlement refused, no funds lost               | TBD              |
| Short deposit                                   | Automatic refund to buyer                       | TBD              |
| Replay of signed payload                        | Rejected                                        | TBD              |
| `on_deposit` serve then swap failure            | Buyer refunded; seller exposure within cap      | TBD              |
| `on_success` delivery                           | Served only after success                       | TBD              |
| Pending-and-push                                | Result pushed on success                        | TBD              |
| Same-chain pass-through                         | Existing facilitator settles unchanged          | TBD              |
| Discovery federation                            | Entries from at least two catalogs appear       | TBD              |
| MCP tools end to end                            | Agent finds and pays a service on another chain | TBD              |

## 5. Conclusions

To be written after testing. Include recommended default delivery mode per corridor and recommended exposure caps.
