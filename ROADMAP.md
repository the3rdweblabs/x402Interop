<!--
provenance: "native"
copyright: "2026 The3rdWebLabs"
-->

# Roadmap

Work is sequenced as milestones. Each one depends on the one before it. Nothing here is tied to a calendar date.

## Milestone 0: research and design (done)

- Landscape review of x402 and NEAR Intents
- Architecture, scheme draft, security model

## Milestone 1: first corridor

- Monorepo scaffold: packages, apps, CI, and the design docs (landed)
- Base to Sui and Base to NEAR over the deposit-address path
- Dynamic 402 seller middleware that mints a quote per request
- Status tracker with webhooks and receipts
- Measure real settlement times; fill TEST_REPORT
- Validate the gasless deposit-address hypothesis

## Milestone 2: discovery

- Federated index across at least two existing catalogs plus direct registration
- MCP tools: `search_services`, `get_service`, `prepare_payment`, `pay_and_fetch`, `payment_status`, `get_credit`
- Health probes and delisting rules

## Milestone 3: speed and repeat buyers

- Intents-balance path
- Tiered delivery modes (`on_deposit`, `on_success`, `pending_push`) with exposure caps
- Voucher format for credit accounts

## Milestone 4: more chains

- Solana, Arbitrum, Polygon, Monad, X Layer, Ethereum, TON
- Robinhood Chain after confirming token support for signed authorisations
- XRPL and Tron after reviewing specs and tooling

## Milestone 5: Bitcoin

- Lightning top-up with L402-style proofs
- Background BTC to stablecoin rebalancing through Intents

## Milestone 6: agent safety

- Mandate layer (budgets, allowlists, expiry)
- Scoped keys on chains that support them; session-key equivalents elsewhere

## Milestone 7: ecosystem

- Propose the scheme family to the official x402 specification process
- Public facilitator, SDKs, and documentation site
- Security review beyond the disclosure policy in SECURITY.md

## Open items

- Legal and compliance review for operating the facilitator and any credit or Lightning services
- Pricing model on top of the Intents fee
- Licence is GPL-3.0-or-later (decided with the repository `LICENSE`)
