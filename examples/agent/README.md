<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# x402Interop agent example

An OpenAI-powered agent that pays x402Interop-protected resources using **one source wallet** and the `@x402interop/*` packages directly (no external facilitator URL). It talks only to the resource service (`RESOURCE_BASE_URL`).

## What it demonstrates

- Discovers resources that want payment in different destination assets/chains (e.g. seller wants Sui USDC, another wants NEAR USDC).
- Pays from **one origin source wallet** (default: Base USDC, `eip155:8453`) through the 1Click/x402Interop flow.
- Handles `402 -> sign/pay -> settle -> fetch`.
- Reads the canonical `PAYMENT-REQUIRED` header, so it works with both the empty x402 body and `PAYMENT_REQUIRED_BODY=json`.

Source wallet families are modelled as pluggable (`SourcePayer`). **EVM origin is implemented now** because that is the verified end-to-end path in the current stack; Sui/NEAR/SVM origins can be added behind the same interface.

## Modes

- `MODE=test` (default): builds a valid signed interop payload but does **not** broadcast a real origin transaction. Use with `examples/resource` in `MODE=test` to verify the stack flow.
- `MODE=live`: broadcasts a real origin transfer to the quote's deposit address. Requires `ORIGIN_PRIVATE_KEY`, funded origin funds, `CONFIRM_SPEND=true`, and mainnet awareness (NEAR Intents has no testnet).

## OpenAI configuration

Override the base URL / key / model for OpenAI-compatible providers:

```env
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TEMPERATURE=0
OPENAI_MAX_TOKENS=1200
```

## Run

```sh
cp .env.example .env
pnpm --filter x402interop-example-agent build

# direct flow (no OpenAI needed)
pnpm --filter x402interop-example-agent start -- list
pnpm --filter x402interop-example-agent start -- buy sui-usdc-report

# OpenAI agent
pnpm --filter x402interop-example-agent start -- ask "buy the Sui report and the NEAR report"
```

## Safety

Mainnet sends are real. Set `MAX_SPEND_ATOMIC` low, keep `CONFIRM_SPEND=false` until you intend to broadcast, and never commit keys.
