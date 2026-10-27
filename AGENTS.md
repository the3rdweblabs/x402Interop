<!--
provenance: "native"
copyright: "2026 The3rdWebLabs"
-->

# AGENTS.md

Notes for coding agents working in this repository. Read this before editing.

## What this is

x402Interop is The3rdWebLabs' interoperability layer for the x402 agent-payment economy. A buyer pays on the chain it already uses, the seller is paid on its own chain, and agents discover services across chains. Cross-chain settlement goes through NEAR Intents (1Click API).

This tree is a scaffold. Do not add live chain calls, live 1Click calls, or a float.

## Provenance

Code in this repository is `[native]` and licensed GPL-3.0-or-later, including the x402 v2 type declarations. Those declarations follow the public x402 specification v2. They are not a copy of the x402 Foundation TypeScript implementation (Apache-2.0). Say so in `NOTICE` if you later vendor upstream source. Vendored x402 source stays Apache-2.0, is tagged `[adapted]`, and names the upstream path.

Every source file starts with:

```
// SPDX-License-Identifier: GPL-3.0-or-later
// [native]
```

Markdown starts with an HTML comment: `provenance: "native"` and `copyright: "2026 The3rdWebLabs"`.

## Layout

`apps/` and `packages/` sit at the repository root. There is no `typescript/` wrapper.

```
apps/facilitator          facilitator          [native] private
apps/discovery            discovery            [native] private
apps/mcp                  mcp                  [native] private
apps/explorer             explorer             [native] private
packages/core             @x402interop/core    [native]
packages/intents          @x402interop/intents [native]
packages/schemes          @x402interop/schemes [native]
packages/adapters/evm     @x402interop/evm     [native]
packages/adapters/svm     @x402interop/svm     [native]
packages/adapters/sui     @x402interop/sui     [native]
packages/adapters/near    @x402interop/near    [native]
packages/adapters/ton     @x402interop/ton     [native]  scheme id x402interop-tvm
packages/adapters/tron    @x402interop/tron    [native]
packages/adapters/xrpl    @x402interop/xrpl    [native]
packages/adapters/lightning @x402interop/lightning [native]
packages/quote            @x402interop/quote   [native]
packages/status           @x402interop/status  [native]
packages/facilkit         @x402interop/facilkit [native]
packages/discovery        @x402interop/discovery [native]
packages/client           @x402interop/client  [native]
packages/express          @x402interop/express [native]
packages/mandate          @x402interop/mandate [native]
specs/                    SCHEME_SPEC, FACILITATOR_API
examples/                 buyer-agent-base, seller-sui, seller-near
tests/e2e/
docs/
```

The npm scope is `@x402interop` (lowercase). Chain packages are named after the chain, with no `adapter-` prefix. Apps are private.

## Verified facts and hypotheses

Re-check anything you are about to rely on. The notes in `docs/PROJECT_NOTES.md` separate **(verified)**, **(secondary)**, and **(hypothesis)**.

- NEAR Intents 1Click: `POST /v0/quote`, a single-use deposit address, then `GET /v0/status`. Asset ids look like `nep141:<chain>-<address>.omft.near`. Confirm the live set with `GET /v0/tokens`. **(verified, as of 27 Oct 2026; the list moves)**
- There is no Intents testnet. Test with small amounts. **(verified)**
- Unauthenticated 1Click use costs about 0.2%. The partner JWT is server-side only. **(verified)**
- A gasless EIP-3009 transfer to a deposit address counts as a valid 1Click deposit. **(hypothesis)**
- `sui:mainnet`, `near:mainnet`, `ton:mainnet`, `tron:mainnet`, `xrpl:mainnet`, and `lightning:mainnet` are provisional ids in this scaffold. EVM ids use CAIP-2 (`eip155:8453` and the others listed on the EVM adapter). Solana uses the mainnet genesis CAIP id.

## DECIDED

- Own facilitator, compatible with x402 already deployed. Same-chain payments pass through later. They are not implemented here.
- One scheme family, keyed by the buyer's chain family.
- No facilitator float and no pre-positioned buyer wallets.
- Default path is a deposit address plus a seller-chosen delivery mode.
- Bitcoin is payer-only, via Lightning top-up, not an Intents Lightning feature.
- Licence is GPL-3.0-or-later. `package.json` uses that SPDX id.
- Workspace root is `x402interop_monorepo`. Packages live at the root, not under `typescript/`.
- Public packages version together from `1.0.0` via changesets.

## Tooling

- pnpm 11.5.0 (`packageManager`), Node >= 22, `minimumReleaseAge: 4320`.
- Turborepo: `build` (depends on `^build`), `test` (depends on `build`), `typecheck` (depends on `^build`).
- tsup dual build: `dist/esm/index.js` and `dist/cjs/index.cjs`, types beside the ESM build.
- TypeScript strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
- ESLint 9 flat config and typescript-eslint recommended. Prettier: no semicolons, single quotes, print width 100.
- Vitest 3 with coverage thresholds of 90% lines, functions, branches, and statements.
- zod for schemas. viem for the EVM address check. Do not add ethers.

## Scope discipline

Do not add empty language trees (`python/`, `go/`, `rust/`) or packages this roadmap is not building. Adapter packages exist because the scaffold lists them. Leave their verify and settle methods unimplemented until that chain is in scope.

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

Commits use `component(sub): lowercase imperative summary` with no type prefix, no trailing period, and no emoji. The body says why, then `- ` bullets.

## Commit example

```
repo: add workspace tooling and ci

The scaffold needs one install and one CI path before any package
can land, and the lockfile has to exist before those packages import
each other.

- pin pnpm 11.5.0 and Node 22
- add turbo, eslint, prettier, changesets, and the ci workflow
```
