# Adapters Consolidation TODO (Live)

## Decisions Applied
- [x] Use subpath exports per family: `@x402interop/adapters/evm`, `./svm`, `./sui`, `./near`, `./ton`, `./tron`, `./xrpl`, `./lightning`
- [x] Keep old adapter packages (`@x402interop/evm`, etc.) as thin re-exports (backwards compatible)
- [x] Each family adapter handles BOTH schemes: standard `exact` and `x402interop-*` (family decides by `requirements.scheme`)
- [x] Split into `exact.ts` and `interop.ts` per family, composed in `index.ts`
- [x] Bridge to official `@x402/*` where available (prefer `@x402/sui` for Sui `exact`), else minimal compatible fallback
- [x] `exact` has no binding/depositAddress requirement; `x402interop-*` requires quote binding/depositAddress
- [x] Root helpers: `getAdapter`, `getAllAdapters`, `isSupported`, `supportedNetworks`, `supportedSchemes`, `verify`, `settle`
- [x] Auto-detect by scheme/network

## Phase 0: Questions (resolved)
- [x] Q1: Keep old packages as re-exports until migration complete
- [x] Q2: Bridge to official `@x402/*` where compatible, else reimplement minimal
- [x] Q3: Start with `exact` only (make `schemes[]` extensible)
- [x] Q4: Routing inside family adapter based on `requirements.scheme`
- [x] Q5: Keep CAIP-2 networks
- [x] Q6: Use `@x402/sui` for Sui `exact` when available

## Phase 1: Scaffold Unified Package
- [x] Create `packages/adapters/` structure
- [x] `package.json` with subpath exports
- [x] `tsconfig.json`, `tsup.config.ts` (multi-entry)
- [x] `src/types.ts` with `FamilyAdapter` extending `ChainAdapter` + `schemes[]`
- [x] `src/shared/utils.ts` (store/nonce/quote helpers)
- [x] `src/detect.ts`
- [x] `src/registry.ts` with `getAdapter`, `verify`, `settle`, helpers
- [x] `src/index.ts` root exports

## Phase 2: Migrate Families (split exact/interop)
- [x] `src/evm/` - index, exact, interop
- [x] `src/svm/` - index, exact, interop  
- [x] `src/sui/` - index, exact (bridge to @x402/sui if available), interop
- [x] `src/near/` - index, exact, interop
- [x] `src/ton/` - index, exact, interop
- [x] `src/tron/` - index, exact, interop
- [x] `src/xrpl/` - index, exact, interop
- [x] `src/lightning/` - index, exact, interop

## Phase 3: Bridge to Official @x402/*
- [x] Add optional deps for official packages where useful
- [x] Sui: attempt to use `@x402/sui` for `exact` verification/settlement
- [ ] EVM: check `@x402/evm` if available (optional)
- [ ] SVM: check `@x402/solana` if available (optional)
- [ ] Others: minimal compatible fallbacks

## Phase 4: Migrate Consumers
- [ ] Update `packages/facilkit` to use `@x402interop/adapters` (prefer subpaths/root)
- [ ] Update `apps/facilitator` to use unified adapters
- [ ] Convert old packages to re-exports:
  - [ ] `packages/adapters/evm/src/index.ts` -> re-export from `@x402interop/adapters/evm`
  - [ ] `packages/adapters/svm/src/index.ts` -> re-export from `@x402interop/adapters/svm`
  - [ ] `packages/adapters/sui/src/index.ts` -> re-export from `@x402interop/adapters/sui`
  - [ ] `packages/adapters/near/src/index.ts` -> re-export from `@x402interop/adapters/near`
  - [ ] `packages/adapters/ton/src/index.ts` -> re-export from `@x402interop/adapters/ton`
  - [ ] `packages/adapters/tron/src/index.ts` -> re-export from `@x402interop/adapters/tron`
  - [ ] `packages/adapters/xrpl/src/index.ts` -> re-export from `@x402interop/adapters/xrpl`
  - [ ] `packages/adapters/lightning/src/index.ts` -> re-export from `@x402interop/adapters/lightning`

## Phase 5: Build, Test, Verify
- [ ] `pnpm --filter @x402interop/adapters build`
- [ ] `pnpm --filter @x402interop/adapters typecheck`
- [ ] Update and build dependents
- [ ] `pnpm build` (root)
- [ ] `pnpm test`
- [ ] `pnpm --filter e2e test`
- [ ] Sanity check: standard `exact` payment path works alongside `x402interop-*`
- [ ] Sanity check: subpath imports work (`@x402interop/adapters/sui`)
