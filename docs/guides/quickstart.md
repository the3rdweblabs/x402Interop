<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Quickstart

Pay for a Sui-hosted resource from Base, in five minutes, with no bridge and no Sui wallet.

## Prerequisites

- Node.js 22+, pnpm 11.5.0
- A facilitator endpoint (self-hosted or provided) and an API key
- Small amounts - there is no NEAR Intents testnet

## Step 1: Seller protects a route

```ts
import { x402interop } from '@x402interop/servers/express'

app.get(
  '/api/report',
  x402interop({
    facilitator: process.env.FACILITATOR_URL,
    apiKey: process.env.FACILITATOR_API_KEY,
    payTo: process.env.SELLER_ADDRESS,
    network: 'sui:mainnet',
    asset: process.env.SELLER_ASSET,
    price: '0.20',
    amount: '200000',
    deliveryMode: 'on_deposit',
    mintQuotes: true,
    buyerNetwork: 'eip155:8453',
    buyerAsset: 'nep141:base-usdc.omft.near',
  }),
  (req, res) => res.json({ report: '…' }),
)
```

The first request without a payment header gets `402` + `PAYMENT-REQUIRED`. With `mintQuotes: true`, the middleware mints a per-request quote and fills `payTo` with the single-use deposit address.

## Step 2: Buyer pays and retries

```ts
import { wrapFetchWithInterop } from '@x402interop/client'

const fetchWithInterop = wrapFetchWithInterop(fetch, { spendControls: false })

const res = await fetchWithInterop('https://seller.example/api/report', {
  headers: { accept: 'application/json' },
})
// 1st call → 402 with PAYMENT-REQUIRED
// wrapper signs and retries with PAYMENT-SIGNATURE
// 2nd call → 200 with the report and PAYMENT-RESPONSE
```

## Step 3: Verify the receipt

The response includes `PAYMENT-RESPONSE` (base64 `SettleResponse`) with `originTxHash` and `destinationTxHash` when 1Click reports them.

## Next steps

- [Seller guide](/guides/seller) - full middleware options, delivery modes, discovery registration
- [Buyer guide](/guides/buyer) - `createInteropClient`, `registerInteropHandlers`, custom signers
- [Chain & asset coverage](/reference/chains-and-assets) - pick your corridor
