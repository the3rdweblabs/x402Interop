# AGENTS.md

Notes for coding agents working in this repository. Read this before editing.

## What this is

> **x402Interop is THE3RDWEBLABS' interoperability layer for the x402 agent-payment economy. A buyer pays on the chain it already uses, the seller is paid on its own chain, and agents discover services across chains. Cross-chain settlement goes through NEAR Intents (1Click API).**

## Provenance

Code in this repository is `[native]` and copyleft, including the x402 v2 type declarations. Those declarations follow the public x402 specification v2. Chain-specific behaviour comes from the upstream `@x402/*` packages (Apache-2.0). This tree depends on them and does not vendor their source. Say so in `NOTICE` if you later vendor upstream source. Vendored x402 source stays Apache-2.0, is tagged `[adapted]`, and names the upstream path.

Two licences apply, split by how the code is shipped:

- `packages/*` - **GPL-3.0-or-later**. These are published libraries other people install and run in their own programs.
- `apps/*` - **AGPL-3.0-or-later**. These are operated as network services by THE3RDWEBLABS.

Each `package.json` declares the licence for its tree; `NOTICE` states the split and `LICENSE` / `LICENSE-AGPL` carry both texts.

Every source file starts with:

```
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]
```

Under `apps/`, the first line is `SPDX-License-Identifier: AGPL-3.0-or-later`; the other two are
identical. Markdown starts with an HTML comment: `provenance: "native"` and
`copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"`. Every other file type
uses the same three lines in its own comment style (`//`, `#`, `--`, or a CSS block).

## Layout

`apps/` and `packages/` sit at the repository root. There is no `typescript/` wrapper.

```
apps/facilitator          facilitator          [native] private
apps/marketplace          marketplace          [native] private
apps/interop              docs + landing       [native] private
packages/core             @x402interop/core    [native]
packages/adpt             @x402interop/adpt    [native]
packages/intents          @x402interop/intents [native]
packages/facilkit         @x402interop/facilkit [native]
packages/client           @x402interop/client  [native]
packages/servers          @x402interop/servers [native]  subpaths: ./express ./hono ./fastify ./next
examples/                 live-canary
tests/e2e/
docs/                     docs source; apps/interop renders a generated copy
```

The npm scope is `@x402interop` (lowercase). Apps are private.

- `intents` owns the quote lifecycle (`mintQuote`/`quoteToRequirements`/`parseQuoteRequest`) beside the 1Click clients.
- `facilkit` owns `createInteropFacilitator()`, the store, status tracking, MCP tools, and supported kinds.
- `client` owns `createInteropClient`, `wrapFetchWithInterop`, and `registerInteropHandlers`.
- `servers` owns the framework subpaths (`./express ./hono ./fastify ./next`).
- `adpt` owns each chain family. Import them through the `@x402interop/adpt` subpaths.

## Verified facts and hypotheses

Re-check anything you are about to rely on. The notes in `docs/internal/project-notes.md` separate **(verified)**, **(secondary)**, and **(hypothesis)**.

- NEAR Intents 1Click: `POST /v0/quote`, a single-use deposit address, then `GET /v0/status`. Asset ids look like `nep141:<chain>-<address>.omft.near`. Confirm the live set with `GET /v0/tokens`. **(verified, as of 27 Oct 2026; the list moves)**
- There is no Intents testnet. Test with small amounts. **(verified)**
- Unauthenticated 1Click use costs about 0.2%. The partner JWT is server-side only. **(verified)**
- A gasless EIP-3009 transfer to a deposit address counts as a valid 1Click deposit. **(hypothesis)**
- Network ids are canonical CAIP-2: EVM `eip155:<chainId>`, Solana the mainnet genesis id, `sui:mainnet`, `near:mainnet`, `tvm:-239`, `tron:728126428`, `xrpl:0`, `lnbtc:<genesis-prefix>`, `bip122:<genesis-prefix>`, `aptos:1`, `stellar:pubnet`, `starknet:SN_MAIN`. The catalogue lives in `packages/core/src/networks.ts`.

## DECIDED

- Own facilitator, compatible with x402 already deployed. Same-chain payments pass through later. They are not implemented here.
- One scheme family, keyed by the buyer's chain family.
- No facilitator float and no pre-positioned buyer wallets.
- Default path is a deposit address plus a seller-chosen delivery mode.
- Bitcoin is payer-only, via Lightning top-up, not an Intents Lightning feature.
- Licence: published packages (`packages/*`) are GPL-3.0-or-later; hosted applications (`apps/*`) are AGPL-3.0-or-later. `package.json` uses those SPDX ids.
- Workspace root is `x402interop_monorepo`. Packages live at the root, not under `typescript/`.
- Public packages version together from `1.0.0`.

## Tooling

- pnpm 11.5.0 (`packageManager`), Node >= 22, `minimumReleaseAge: 4320`.
- Turborepo: `build` (depends on `^build`), `test` (depends on `build`), `typecheck` (depends on `^build`).
- tsup dual build: `dist/esm/index.js` and `dist/cjs/index.cjs`, types beside the ESM build.
- TypeScript strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
- ESLint 9 flat config and typescript-eslint recommended. Prettier: no semicolons, single quotes, print width 100.
- Vitest 3 with coverage thresholds of 90% lines, functions, branches, and statements.
- zod for schemas. viem for the EVM address check. Do not add ethers.

## Scope discipline

Do not add empty language trees (`python/`, `go/`, `rust/`) or packages this roadmap is not building. Every adpt family in the manifest ships a real verification path: upstream `@x402/*` delegation, a spec-native `exact` implementation (sui/starknet/lightning), or interop-only where no official spec exists (tron, utxo). Unwired chain checks fail closed; they never fabricate validity.

Do not put the 1Click JWT, relayer keys, or seller API keys in source, tests, or 402 bodies.

## Non-negotiables

- No float and no live settlement in unit tests.
- Buyer signatures stay bound to one quote, one deposit address, one nonce, and an expiry.
- `refundTo` is the buyer's origin-chain address.
- Mark unmeasured claims as **(hypothesis)**.
- British spelling in commit messages and prose (`behaviour`, `licence`).

## Pre-PR checklist

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Commits use `component(sub): lowercase imperative summary` with no type prefix, no trailing period, and no emoji. The body says why, then `-` bullets.

## Commit example

```
repo: add workspace tooling and ci

The workspace needs one install and one CI path before any package
can land, and the lockfile has to exist before those packages import
each other.

- pin pnpm 11.5.0 and Node 22
- add turbo, eslint, prettier, and the ci workflow
```
