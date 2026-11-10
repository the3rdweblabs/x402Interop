<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# @x402interop/servers

Framework bindings that add x402Interop to upstream x402 resource middleware.
Same 402 shapes, same headers, same middleware names - the interop bits are
additional scheme entries, not a new transport.

## Subpaths

| Subpath                        | Framework      | Upstream package |
| ------------------------------ | -------------- | ---------------- |
| `@x402interop/servers/express` | Express ≥ 4.18 | `@x402/express`  |
| `@x402interop/servers/hono`    | Hono ≥ 4       | `@x402/hono`     |
| `@x402interop/servers/fastify` | Fastify ≥ 4    | `@x402/fastify`  |
| `@x402interop/servers/next`    | Next.js ≥ 14   | `@x402/next`     |

Each subpath re-exports the upstream names verbatim (`paymentMiddleware`,
`ExpressAdapter`, `setSettlementOverrides`, …). Additionally, `paymentMiddleware`
accepts one extra calling shape:

```ts
import { paymentMiddleware } from '@x402interop/servers/express'

app.use(
  paymentMiddleware(routes, {
    facilitator: 'https://facilitator.example',
    schemes: 'all', // 'exact' + every x402interop-* scheme
    networks: 'all', // day-one mainnet catalogue, unless excluded
    payTo: '0xSeller...', // interop entries are filled per request
    price: '$0.01',
  }),
)
```

The former `@x402interop/express` package is deleted; `./express` is the
canonical entry point.

## Root exports

- `interopAccept(options)` - expands `'all'` into one interop entry per
  (scheme × network) with a vacant `payTo`.
- `expandRoutes(routes, powers)` - `$interop` / `$exact` / `$all` shorthand in
  route accepts.
- `resolveCapabilities` - the capabilities matrix (`'all'` by default).
- `createInteropSchemeServer` - per-family `SchemeNetworkServer` that mints
  quotes through an injected minter (see `@x402interop/intents`).
- `x402interop`, `buildPaymentRequired`, `SellerOptions` - framework-agnostic
  middleware moved here from the old express package.

Chain/asset coverage
(`docs/CHAINS_AND_ASSETS.md`), and mirrored scheme specs
(`docs/specs/schemes/README.md`).
