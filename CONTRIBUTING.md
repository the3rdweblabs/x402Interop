<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS"
-->

# Contributing to x402Interop

Thanks for helping. This project is early. The design docs are the best place to start.

## Ways to help

- Test a corridor with small amounts and add results to docs/TEST_REPORT.md.
- Review specs/SCHEME_SPEC.md and open issues with concrete suggestions.
- Build or review a chain adapter (see SCHEME_SPEC section 9).
- Improve seller middleware for other frameworks.
- Report security concerns privately. See SECURITY.md.

## Ground rules

- Mark unverified claims as **(hypothesis)** and cite sources for verified ones.
- Never commit API keys, relayer keys, or real seller credentials.
- Do not publish measurements that were not actually taken.
- Keep the design principles: no facilitator float, no multi-wallet burden, compatible with existing x402 deployments.

## Development workflow

1. Open an issue describing the change.
2. Branch from `main` and open a pull request into `main`.
3. Include tests or, for docs, the evidence behind the claim.

From a clean checkout:

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

## Code style

TypeScript is the language for SDKs, the facilitator, and middleware.

- pnpm 11.5.0, Node 22, Turborepo, tsup, Vitest.
- Prettier: no semicolons, single quotes, print width 100.
- ESLint 9 flat config with typescript-eslint.
- SPDX `GPL-3.0-or-later` and a `[native]` or `[adapted]` tag on every source file.
- Commits: `component(sub): lowercase imperative summary`, British spelling, no type prefix, no trailing period, no emoji. The body says why, then a `- ` list.

## Community

- Telegram: https://t.me/the3rdweblabs
- X: https://x.com/the3rdweblabs
