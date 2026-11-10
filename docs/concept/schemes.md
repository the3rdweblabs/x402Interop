<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Schemes

## Scheme families

Every chain family has an interop scheme keyed by the buyer's chain family:

| Family       | Scheme                  | CAIP-2 example                            |
| ------------ | ----------------------- | ----------------------------------------- |
| EVM          | `x402interop-evm`       | `eip155:8453`                             |
| SVM (Solana) | `x402interop-svm`       | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Sui          | `x402interop-sui`       | `sui:mainnet`                             |
| NEAR         | `x402interop-near`      | `near:mainnet`                            |
| TON          | `x402interop-tvm`       | `tvm:-239`                                |
| TRON         | `x402interop-tron`      | `tron:728126428`                          |
| XRP Ledger   | `x402interop-xrpl`      | `xrpl:0`                                  |
| Aptos        | `x402interop-aptos`     | `aptos:1`                                 |
| Stellar      | `x402interop-stellar`   | `stellar:pubnet`                          |
| Starknet     | `x402interop-starknet`  | `starknet:SN_MAIN`                        |
| Lightning    | `x402interop-lightning` | `lnbtc:000000000019d6689c085ae165831e93`  |
| UTXO         | `x402interop-utxo`      | `bip122:…`                                |

## Same-chain schemes

| Scheme                                     | Implemented by                     | Chains                                    |
| ------------------------------------------ | ---------------------------------- | ----------------------------------------- |
| `exact`                                    | upstream `@x402/*` package         | EVM, SVM, NEAR, TON, XRPL, Aptos, Stellar |
| `exact`                                    | spec-native in `@x402interop/adpt` | Sui, Starknet, Lightning                  |
| `upto`, `auth-capture`, `batch-settlement` | upstream                           | opt-in, not part of the default set       |

## Interop-only chains

No official `exact` spec exists, so no third-party scheme package is used:

- **TRON** (`tron:728126428`)
- **UTXO chains** - Bitcoin, Bitcoin Cash, Litecoin, Dash, Zcash, Dogecoin

## Implementation rule

`@x402interop/adpt` never implements a scheme that an official upstream package covers. It implements an official `exact` spec spec-natively only when no upstream package exists (Sui, Starknet, Lightning), and only from the mirrored spec under `docs/specs/schemes/`.

## Route sugar: advertise all schemes at once

There is no single `x402interop-all` scheme. To advertise every interop scheme on a route, use the `$interop` / `$all` route sugar in `@x402interop/servers`:

```ts
import { expandRoutes } from '@x402interop/servers'

const routes = expandRoutes({
  'GET /report': {
    description: 'Cross-chain protected report',
    accepts: [{ scheme: '$interop', network: '$all', price: '$0.20', payTo: '' }],
  },
})
```

| Token      | Expands to                            |
| ---------- | ------------------------------------- |
| `$interop` | Every `x402interop-*` scheme          |
| `$all`     | `exact` plus every interop scheme     |
| `$exact`   | Just `exact`                          |
| `$name`    | A single named scheme (strip the `$`) |

Expansion happens once at startup; the hot path stays upstream's.
