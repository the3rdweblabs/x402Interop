# Official x402 Scheme Specs (mirrored)

This directory mirrors the official scheme specifications from
[x402-foundation/x402 → `specs/schemes`](https://github.com/x402-foundation/x402/tree/main/specs/schemes).

Every file starts with an HTML comment pointing at its upstream source URL and
the fetch date. The files are copied **verbatim** apart from that header -
never paraphrased. When upstream changes a spec, re-fetch the file and update
the header date.

## Why mirrored

x402Interop implements schemes **from these documents**, never from a
third-party scheme package that a spec does not authorise:

- Where an official upstream package exists, we delegate to it (it is the
  canonical implementation of its own spec).
- Where a spec exists but no upstream package does, we implement the scheme
  **spec-native** in `@x402interop/adpt`.
- Where no spec exists, the chain is **interop-only** - we never invent an
  `exact` scheme for it.

## Scheme → chain → implementation

| Scheme                                                                                                                         | Spec file(s)                                          | Implemented by                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| `exact` (generic, algorithms)                                                                                                  | `exact/scheme_exact.md`, `exact/scheme_exact_algo.md` | -                                                            |
| `exact` on EVM chains (Arbitrum, Base, Berachain, BNB, Ethereum, Optimism, Plasma, Polygon, Avalanche, Monad, X Layer, Scroll) | `exact/scheme_exact_evm.md`                           | upstream `@x402/evm`                                         |
| `exact` on Solana                                                                                                              | `exact/scheme_exact_svm.md`                           | upstream `@x402/svm`                                         |
| `exact` on NEAR                                                                                                                | `exact/scheme_exact_near.md`                          | upstream `@x402/near`                                        |
| `exact` on TON                                                                                                                 | `exact/scheme_exact_ton.md`                           | upstream `@x402/tvm`                                         |
| `exact` on the XRP Ledger                                                                                                      | `exact/scheme_exact_xrpl.md`                          | upstream `@x402/xrpl`                                        |
| `exact` on Aptos                                                                                                               | `exact/scheme_exact_aptos.md`                         | upstream `@x402/aptos`                                       |
| `exact` on Stellar                                                                                                             | `exact/scheme_exact_stellar.md`                       | upstream `@x402/stellar`                                     |
| `exact` on Sui                                                                                                                 | `exact/scheme_exact_sui.md`                           | **spec-native** in `@x402interop/adpt` (no upstream package) |
| `exact` on Starknet (SNIP-9 outside execution)                                                                                 | `exact/scheme_exact_starknet.md`                      | **spec-native** in `@x402interop/adpt` (no upstream package) |
| `exact` on Bitcoin Lightning (`lnbtc`, BOLT11)                                                                                 | `exact/scheme_exact_lnbtc.md`                         | **spec-native** in `@x402interop/adpt` (no upstream package) |
| `upto` (EVM, SVM, XRPL)                                                                                                        | `upto/scheme_upto*.md`                                | upstream (opt-in)                                            |
| `auth-capture` (EVM)                                                                                                           | `auth-capture/scheme_auth_capture*.md`                | upstream (opt-in)                                            |
| `batch-settlement` (EVM, SVM)                                                                                                  | `batch-settlement/scheme_batch_settlement*.md`        | upstream (opt-in)                                            |

Chains not covered by any official `exact` spec and therefore **interop-only**:

- **TRON** (`tron:728126428`)
- **UTXO chains** - Bitcoin, Bitcoin Cash, Litecoin, Dash, Zcash, Dogecoin
  (BIP-122 networks; no third-party TRON/UTXO scheme package is used)

## Files not mirrored

`scheme_exact_{canton,cardano,casper,concordium,hedera,keeta}.md` exist upstream
but cover chains outside the x402Interop day-one corridor set and are not
mirrored here. Fetch them from upstream if those chains are added.
