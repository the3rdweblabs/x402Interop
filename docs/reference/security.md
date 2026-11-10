<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Security & trust model

## Trust summary

| Party                             | Trusted for                                                           | Not trusted for                                                           |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Buyer                             | Signing its own payments                                              | Anything about the seller                                                 |
| Seller                            | Serving after the agreed event                                        | Handling buyer keys                                                       |
| x402interop facilitator           | Verifying, submitting the origin transfer, tracking, honest reporting | Moving funds beyond what buyers signed                                    |
| NEAR Intents                      | Executing the swap and delivering or refunding                        | Not trustless: funds are custodied by the settlement system during a swap |
| Chain facilitators (pass-through) | Settling same-chain payments                                          | -                                                                         |

Design principle from x402: a facilitator or server must not be able to move funds other than as the client intended. Every buyer signature is bound to one quote, one deposit address, one nonce, and an expiry.

## Threats and mitigations

| Threat                                  | Mitigation                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Deposit address reuse or substitution   | Single-use address per quote; verify address and amount exactly match the quote before settling |
| Replay of a signed payment              | Nonces, expiry, and rejection of replays after refund                                           |
| Quote expiry race                       | Enforce `expiresAt`; refuse to settle after expiry                                              |
| Amount mismatch or short deposit        | Exact-match checks; automatic refund for short deposits                                         |
| Refund to the wrong party               | Validate `refundTo` equals the buyer's origin-chain address                                     |
| Seller loses value in `on_deposit` mode | Per-buyer and per-seller exposure caps; refund is automatic on failure                          |
| Facilitator compromise                  | Minimal hot keys (gas relayer only); monitoring and key rotation                                |
| Leaking the 1Click API key              | Server-side only; never in 402 responses, payloads, logs, or client code                        |
| Malicious catalog entries               | Health probes, delisting, rate limits on registration, source labeling                          |
| Prompt injection via catalog text       | Treat discovery metadata as untrusted data (see MCP guide)                                      |
| Webhook forgery                         | Signed webhooks; sellers verify signatures                                                      |
| Denial of service on quote minting      | Rate limits, caching, per-key quotas                                                            |
| Double payment from retries             | Idempotency keys; `payment_status` before retry                                                 |

## Custody disclosure

Users and sellers must be told, in plain language, that while a swap is in progress their funds are held by the NEAR Intents settlement system, which either delivers the destination asset or refunds the deposit. This is not a trustless path. Credit accounts (Intents balance, Lightning top-up) add exposure to the facilitator's operations and must be disclosed and capped.

## Operational controls

- Separate keys per function; hardware-backed storage for any key that can move funds.
- Alerting on stuck swaps, refund spikes, and balance anomalies.
- Reconciliation job comparing facilitator records with 1Click statuses.
- Audit log for quotes, verifications, settlements, and refunds.
- Dependency pinning and review (supply-chain risk).

## Regulatory note

Operating payment infrastructure, holding user credit, or running a Lightning node may carry licensing and compliance obligations depending on jurisdiction. This document is not legal advice; obtain qualified advice before launching to real users.

## Reporting vulnerabilities
