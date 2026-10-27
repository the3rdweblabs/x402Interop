<!--
provenance: "native"
copyright: "2026 The3rdWebLabs"
-->

# Demo video script (2-3 minutes)

Goal: show an agent discovering a service on another chain and paying for it from its own chain, with no bridge and no extra wallet.

## Setup before recording

- A seller API on Sui (or NEAR) protected by the x402interop middleware, registered in discovery.
- A buyer agent with funds only on Base.
- Facilitator running with the Base to Sui corridor enabled. Use small amounts.
- Screen layout: agent chat on the left, facilitator/status view on the right.

## Beats

**0:00-0:15 Problem**
Narration: "Agents pay for APIs over x402, but payments are stuck on one chain. This agent has USDC on Base. The service we want is paid in USDC on Sui."

**0:15-0:40 Discovery**
Agent runs `search_services` for the target service. Show results from more than one catalog, including the Sui service. Narration: "One search across catalogs, chains included."

**0:40-1:10 Quote**
Agent calls `prepare_payment`. Show the single-use deposit address, exact price, fees, and estimated time. Narration: "The seller receives an exact amount on Sui. The agent pays on Base."

**1:10-1:50 Pay and fetch**
Agent calls `pay_and_fetch`. Show the gasless signature, the status moving through `deposit_seen`, `processing`, `success`. Show the result returned and the receipt with both transaction hashes. Narration: "No bridge, no Sui wallet, no gas on Base."

**1:50-2:15 Tiered delivery**
Show the same call in `on_deposit` mode (served as soon as the deposit confirms) versus `on_success`. Narration: "Sellers choose when to serve; failed swaps refund automatically."

**2:15-2:40 Bitcoin (stretch)**
Show a Lightning top-up becoming spendable credit. Narration: "Bitcoin holders top up over Lightning and spend as stablecoin."

**2:40-3:00 Close**
Show the architecture diagram and repo link. Narration: "x402interop: one facilitator for the cross-chain x402 economy. Open source from The3rdWebLabs."

## Tips

- Record the real timings; do not speed up the swap without saying so.
- Keep one corridor flawless rather than showing several half-working ones.
- Mention the custody trade-off honestly: funds are held by Intents during the swap.
