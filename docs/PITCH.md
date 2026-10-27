<!--
provenance: "native"
copyright: "2026 The3rdWebLabs"
-->

# x402interop: one-page pitch

**Tagline:** One facilitator so any agent can pay any x402 service on any chain.

## The problem

AI agents are starting to pay for APIs and data over x402. But each payment is tied to one chain, discovery is split across separate catalogs, and agents or sellers must juggle wallets on several chains. An agent holding USDC on Base cannot simply pay a seller who wants USDC on Sui.

## The solution

x402interop is an open-source cross-chain facilitator, scheme family, and discovery layer for x402.

- **Pay from where you are.** The buyer signs a gasless payment on its own chain.
- **Get paid where you want.** The seller receives an exact amount on its own chain via NEAR Intents.
- **Find anything.** One search across federated catalogs, exposed as an MCP tool.
- **Fast enough for HTTP.** Tiered delivery keeps the swap off the critical path.
- **Bitcoin included.** BTC holders top up over Lightning and spend as stablecoin.
- **No float.** The facilitator never fronts its own liquidity.

## Why now

- x402 now has native support across many chains (EVM chains, Solana, TON, Sui, NEAR, and others), but cross-chain use is not covered by existing schemes.
- NEAR Intents provides cross-chain settlement across a wide set of chains through a simple deposit-and-receive API.
- Agent frameworks speak MCP, making discovery and payment tools easy to adopt.

## How we differ from NEAR's own x402 routing

NEAR already lets a seller set a 1Click deposit address as the payment destination. x402interop builds on that and adds what sellers and agents would otherwise hand-roll:

- a ready facilitator and seller middleware (dynamic per-request quotes);
- gasless buyer experience and tiered delivery modes;
- federated cross-chain discovery over MCP;
- per-chain adapters for chains with thin x402 tooling;
- a Lightning path for Bitcoin payers;
- optional agent spend policy (mandates).

## Who it is for

- API and data sellers who want agent revenue without running wallets on many chains.
- Agent builders who want one payment tool across chains.
- Chains and ecosystems that want their services reachable by agents everywhere.

## Demo (see DEMO_SCRIPT)

An agent searches for a Sui-hosted service through MCP, pays from Base with no bridge and no Sui wallet, and receives the result with a receipt.

## Traction and status

Design and early build. Measured performance will be published in TEST_REPORT. (Add real traction here only when it exists.)

## Track fit (NEAR hackathon, if applicable)

Autonomous payments, real-world payments, agent economies, and cross-chain apps. Confirm the official track list before submitting.

## Team

The3rdWebLabs: a Nigerian open-source Web3 R&D studio building payment infrastructure and developer tooling, with a payments-first focus across Sui, EVM, and Monad ecosystems. Mission: produce credible, globally competitive Web3 infrastructure visibly from Africa.

## Ask

Feedback from NEAR Intents and x402 teams on the scheme design, early sellers to integrate, and partners for discovery and liquidity.
