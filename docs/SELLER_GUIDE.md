<!--
provenance: "native"
copyright: "2026 The3rdWebLabs"
-->

# Seller integration guide (DRAFT)

You run an HTTP API and want agents on any chain to pay you on the chain you prefer.

## What you need

- A receiving address on your preferred chain and the stablecoin you want to receive.
- A facilitator endpoint and API key (self-hosted or provided).
- Middleware for your framework (planned; names are placeholders).

## Steps

1. **Choose where to be paid.** Pick one settlement network and asset. You never need wallets on other chains.
2. **Add the middleware** to the routes you want to charge for.
3. **Pick a delivery mode** (section below).
4. **Register in discovery** so agents can find you.
5. **Handle webhooks** (optional) for `success`, `refunded`, `failed`.

## Minimal example (illustrative)

```ts
import { x402interop } from '@x402interop/express'

app.get(
  '/api/premium/report',
  x402interop({
    facilitator: process.env.FACILITATOR_URL,
    apiKey: process.env.FACILITATOR_API_KEY,
    payTo: process.env.SELLER_ADDRESS,
    network: 'sui:mainnet',
    asset: process.env.SELLER_ASSET,
    price: '0.05',
    amount: '50000',
    deliveryMode: 'on_deposit',
  }),
  (req, res) => res.json({ report: '...' }),
)
```

What the middleware does:

1. If the request has no payment, it asks the facilitator for a quote and returns 402 with payment requirements that include a single-use deposit address.
2. If the request has a payment, it calls `/verify` and `/settle` and serves according to your delivery mode.
3. It sends you events through your webhook.

You can keep your existing x402 options (for example a native `exact` option on your own chain) in the same 402 response alongside the x402interop one.

## Choosing a delivery mode

| Mode           | Use when                 | Trade-off                                                                                                        |
| -------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `on_deposit`   | Calls are cheap and fast | If the swap fails after you serve, the buyer is refunded and you lose that call's value. Cap exposure per buyer. |
| `on_success`   | Calls are expensive      | Buyer waits for the swap (typically under a minute, up to several minutes; see TEST_REPORT).                     |
| `pending_push` | Long-running jobs        | Return 202 with a status URL; deliver the result on success.                                                     |

## Pricing

- Quote the price in the stablecoin you receive. The buyer's cost includes swap fees and slippage.
- Intents applies a 0.2% fee by default without a partner API key; a partner key (held by the facilitator) can reduce this.

## Registering for discovery

Provide: resource URL, short description, price, accepted networks, input/output schema, and contact. The index probes your URL, expects a valid 402, and lists you when healthy. Keep descriptions factual: agents read them, and misleading text is grounds for delisting.

## Security checklist

- Verify webhook signatures.
- Never log or expose the facilitator API key.
- Serve only after the event your delivery mode requires.
- Set per-buyer exposure caps for `on_deposit`.
- Treat the buyer's identity as an address, not a person.

## Testing

There is no NEAR Intents testnet. Test with small amounts and one corridor first.
