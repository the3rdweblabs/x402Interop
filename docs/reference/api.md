<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# API surface

## `@x402interop/client`

- `createInteropClient(options)` - upstream `x402Client` + HTTP helper pair
- `wrapFetchWithInterop(fetch, options)` - auto 402 → `PAYMENT-SIGNATURE` retry
- `registerInteropHandlers(registrar, options)` - register interop scheme clients per (family × network)
- `buildEvmPaymentPayload(params, binding)` - EIP-712 signed EVM interop payload
- `sendEvmPayment(params)` - broadcast EVM payment, returns txHash + payload
- `decodePaymentRequired(response)` - decode a 402 Payment Required response
- `enforceHardPriceCap`, `previewPaymentRequirements` - spend controls

## `@x402interop/intents`

- `mintQuote(request, client, options)` - mint a 1Click quote mapped to x402 shape
- `quoteToRequirements(request, quote, scheme)` - turn a quote into a 402 requirement + extension
- `parseQuoteRequest(value)` - validate a quote request
- `selectPaymentPath(input)` - classify into `deposit_address` / `intents_balance` / `lightning_topup`
- `HttpOneClickClient` - REST 1Click transport
- `MockOneClickClient`, `SimulatorOneClickClient`, `ResilientOneClickClient`, `SdkOneClickClient` - clients

> Removed (legacy): `prepareQuote`, `mintAndPrepare`, `fetchWithLegacyFallback`.

## `@x402interop/facilkit`

- `createInteropFacilitator(options)` - store, nonce ledger, status tracker, MCP, routes
- `routeFacilitator(method, path, body, headers)` - route handler
- `supportedKinds()` - scheme × network advertisement matrix
- `verifyPayment(request, now, options)`, `settlePayment(request, now, options)` - verify + settle

## `@x402interop/servers`

- `x402interop(options)` - framework-agnostic seller middleware (402 or next)
- `buildPaymentRequired(options)` - build a vacant 402 body
- `paymentRequiredFromRequirement(requirement, options)` - wrap a minted requirement
- `interopAccept(options)` - expand an accept selection into a vacant scheme × network matrix
- `expandRoutes(routes, powers)` - `$interop` / `$exact` / `$all` route sugar
- Subpaths: `./express`, `./hono`, `./fastify`, `./next`

## `@x402interop/core`

- `PaymentRequirements`, `PaymentRequired`, `SupportedKind`, `SupportedResponse`, `Network`, `ChainFamily`, `X402_VERSION`, `SCHEME_IDS`, `NETWORK_CATALOGUE`
- `x402InteropExtension(quote)` - build the `x402interop` extension

## Apps

- `apps/facilitator` - thin HTTP shell over `facilkit` (MCP via `/mcp`)
- `apps/marketplace` - marketplace over the facilitator catalogue
