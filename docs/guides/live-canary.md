<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Live canary

`examples/live-canary` mints a real NEAR Intents (1Click) quote for any catalogue corridor, optionally sends the origin leg, and polls the swap to a terminal state. It is the smallest repeatable check that the quote, deposit, and status plumbing still matches the live 1Click API.

Before choosing a corridor, check the [1Click route matrix](/reference/oneclick-route-matrix). BNB Chain has a temporary minimum swap amount (advertised as $1,000 on 5 November 2026; $1,001 quoted). A NEAR destination now quotes directly to an existing `.near` account; x402Interop always uses `recipientType: DESTINATION_CHAIN`, so the seller receives at its final address.

**There is no NEAR Intents testnet.** Every send is a mainnet transfer.

## What it proves - and what it does not

| Proven                                                     | Not this example                                 |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Live 1Click quote for the configured asset pair and amount | Seller-side HTTP routes and a protected resource |
| Canonical x402 v2 402 body for the minted quote            | The browser-facing seller and facilitator loop   |
| Origin EVM transfer to the single-use deposit address      | Automatic sending from non-EVM origins           |
| 1Click status polling through to `SUCCESS` or a refund     | -                                                |

The canary is the transport probe. It exercises the quote and deposit path against live 1Click; the facilitator e2e tests cover verify and settle.

## Exact non-EVM buyers

Sui, Solana, NEAR, and Stellar use the standard `exact` scheme. The buyer client
wraps the upstream implementation; users do not import `@x402/*` directly.

```ts
import { createSuiExactClient } from '@x402interop/client'

const buyer = createSuiExactClient({
  secretKey: process.env.SUI_PRIVATE_KEY!,
  rpcUrl: process.env.RPC_URL_SUI_MAINNET,
})
const payload = await buyer.createPaymentPayload(2, challenge.accepts[0])
```

Equivalent factories are `createSvmExactClient`, `createNearExactClient`, and
`createStellarExactClient`. Never put these keys in browser code.

## Safety model

- Default is quote-only. No transaction is signed or sent.
- `CANARY_SEND=true` alone is not enough. It also requires `CANARY_CONFIRM=send-mainnet`.
- The confirmation token is deliberate friction: show the amount and refund address to the user before setting it.
- Automatic sending only works for EVM origins (`CANARY_ORIGIN_PRIVATE_KEY`). Non-EVM origins are quoted and then paid manually from your own wallet.
- Unit tests use a fake 1Click client and never reach a network.

## Prerequisites

- Node.js 22 or newer and pnpm 11.5.0.
- A destination address on the seller chain.
- For automatic sending: a funded EVM key and a little native gas on the origin.
- Optional: a 1Click partner JWT in `ONECLICK_API_KEY`. Unauthenticated quotes work and cost about 0.2%; the key stays server-side and is never written to the 402 body.

Start with a micro amount. For Base USDC → Sui USDC, a 0.2 USDC output cost `222270` atomic units (0.22227 USDC) when this was verified.

## Fees

x402Interop charges **no application fee**. It does not set or send a 1Click `appFees` entry. Any `appFees` field in a raw 1Click response is 1Click's own fee, not an x402Interop charge.

The fees you will see are:

| Fee                        | Paid in                  | Where it appears                                                    |
| -------------------------- | ------------------------ | ------------------------------------------------------------------- |
| 1Click swap fee            | Origin asset             | Included in `originAmount`; lower with a partner JWT                |
| `withdrawFee`              | Destination asset        | Included in `originAmount`; `amountOut` is net of it                |
| `refundFee`                | Origin asset             | Charged only if the swap refunds                                    |
| Origin-chain gas           | Native gas (ETH on Base) | Paid by the buyer wallet; separate from the quote                   |
| `slippageTolerance` buffer | Origin asset             | Part of `originAmount` for `EXACT_OUTPUT`; unused input is refunded |

Key points:

- `EXACT_OUTPUT` is the default. The seller receives exactly `amountOut`; the buyer pays the fees in `amountIn`. If you want the buyer to pay exactly the quoted amount, use `EXACT_INPUT`; the seller then absorbs the fees.
- `withdrawFee` is roughly fixed per destination chain, not a percentage. It looks large at 0.2 USDC but is small at 5 or 20 USDC.
- A direct NEAR quote includes `withdrawFee` because 1Click performs the final `ft_transfer` to `the3rdweblabs.near`. An `INTENTS` quote shows `withdrawFee: 0` because the merchant pays the withdrawal later.
- `CANARY_SLIPPAGE_BPS` defaults to `100` (1%). It is a tolerance, not a fee.

Example live quotes for a 0.2 USDC output on 5 November 2026:

| Route                    | Buyer sends | Seller receives | `withdrawFee` |
| ------------------------ | ----------- | --------------- | ------------- |
| Base USDC → Sui USDC     | `0.222270`  | `0.200000`      | `0.020000`    |
| Base USDC → NEAR direct  | `0.206643`  | `0.200000`      | `0.004603`    |
| Base USDC → NEAR Intents | `0.202039`  | `0.200000`      | `0`           |

Numbers move with 1Click liquidity. Re-quote before sending.

## Build and list the catalogue

```sh
pnpm install
pnpm --filter live-canary build
pnpm --filter live-canary canary -- --list-assets
```

`--list-assets` prints all 26 chains and 74 catalogue assets with their CAIP-2 network, symbol, decimals, and 1Click asset id.

## Configure

The canary loads `examples/live-canary/.env` automatically. Copy the example
first:

```sh
cp examples/live-canary/.env.example examples/live-canary/.env
```

| Variable                    | Default             | Meaning                                            |
| --------------------------- | ------------------- | -------------------------------------------------- |
| `CANARY_ORIGIN_NETWORK`     | required            | Buyer chain                                        |
| `CANARY_DEST_NETWORK`       | required            | Seller chain                                       |
| `CANARY_AMOUNT`             | required            | Atomic integer                                     |
| `CANARY_ORIGIN_ADDRESS`     | key-derived for EVM | Buyer/refund address                               |
| `CANARY_DEST_ADDRESS`       | required            | Seller address                                     |
| `CANARY_ORIGIN_PRIVATE_KEY` | empty               | EVM key used only when sending                     |
| `CANARY_SEND`               | `false`             | Sign and send the origin transfer                  |
| `CANARY_CONFIRM`            | empty               | Must be `send-mainnet` when `CANARY_SEND=true`     |
| `CANARY_SLIPPAGE_BPS`       | `100`               | Slippage tolerance sent to 1Click, in basis points |
| `CANARY_QUOTE_DRY`          | `false`             | Price only; no deposit address                     |
| `ONECLICK_API_KEY`          | empty               | Optional partner JWT                               |

The seller address is always the final recipient on its own chain, including `near:mainnet`.

## Quote only (default)

```sh
CANARY_ORIGIN_NETWORK=base \
CANARY_DEST_NETWORK=sui:mainnet \
CANARY_AMOUNT=200000 \
CANARY_ORIGIN_ADDRESS=0xYourRefundAddress \
CANARY_DEST_ADDRESS=0xYourSellerAddress \
pnpm --filter live-canary canary -- --json
```

## Automatic send from an EVM origin

```sh
# 1. Quote only, no funds move.
pnpm --filter live-canary canary -- --json

# 2. Send a micro amount. Both gates are required.
CANARY_SEND=true \
CANARY_CONFIRM=send-mainnet \
CANARY_WAIT=true \
pnpm --filter live-canary canary -- --send --wait
```

Exit codes: `0` for `SUCCESS`, `1` for any other terminal status or an error, `2` when the poll deadline passes first.

## Manual payment from a non-EVM origin

Leave `CANARY_ORIGIN_PRIVATE_KEY` empty and set `CANARY_ORIGIN_ADDRESS` to your wallet. Start with `--wait`; the first stderr line prints the deposit address, memo (if the chain needs one), and quote expiry. Pay that address from your wallet before it expires.

## 1Click statuses

See [1Click swap lifecycle](/reference/oneclick-swap-lifecycle) for the quote, deposit, status, and refund sequence behind this table.

| Status               | Terminal | Meaning                                    |
| -------------------- | -------- | ------------------------------------------ |
| `PENDING_DEPOSIT`    | no       | Waiting for the origin transfer            |
| `KNOWN_DEPOSIT_TX`   | no       | Deposit seen, waiting for confirmation     |
| `PROCESSING`         | no       | Swap in flight                             |
| `SUCCESS`            | yes      | Output delivered on the destination chain  |
| `INCOMPLETE_DEPOSIT` | yes      | Deposit below the quoted amount            |
| `REFUNDED`           | yes      | Refunded to `refundTo` on the origin chain |
| `FAILED`             | yes      | Swap failed                                |

## Related docs

- [1Click route matrix](/reference/oneclick-route-matrix) - tested corridors and caveats.
- [1Click swap lifecycle](/reference/oneclick-swap-lifecycle) - the API sequence the canary exercises.
- [Walkthrough](/guides/walkthrough) - the product flow this canary exercises.
- [Security](/reference/security) - custody and trust assumptions during a swap.
- [Chain & asset coverage](/reference/chains-and-assets) - the catalogue.
