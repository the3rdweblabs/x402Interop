<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# 1Click swap lifecycle

How a quote becomes a delivery on the merchant's chain. The flow follows the 1Click docs ([Making a Request](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request), [Request a swap quote](https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote), [Check swap execution status](https://docs.near-intents.org/api-reference/oneclick/check-swap-execution-status)). Tested against the live API on 5 November 2026 with `dry: true` quotes; no funds moved.

## 1. Discover assets

`GET https://1click.chaindefuser.com/v0/tokens`

Asset ids are opaque strings. Examples:

- `nep141:wrap.near`
- `nep141:sui-c1b81ecaf27933252d31a963bc5e9458f13c18ce.omft.near`
- `nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g` (BSC USDT)

Query the live list before every new corridor. Do not assume an asset id from another environment.

## 2. Request a quote

`POST https://1click.chaindefuser.com/v0/quote`

| Field               | Values                                                 | Meaning                                                   |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `dry`               | boolean                                                | `true` prices the swap without creating a deposit address |
| `swapType`          | `EXACT_INPUT`, `EXACT_OUTPUT`, `FLEX_INPUT`            | how `amount` is interpreted                               |
| `originAsset`       | asset id                                               | what the buyer pays                                       |
| `destinationAsset`  | asset id                                               | what the merchant receives                                |
| `amount`            | integer string                                         | smallest unit of the asset named by `swapType`            |
| `depositType`       | `ORIGIN_CHAIN`, `INTENTS`, `CONFIDENTIAL_INTENTS`      | where the buyer pays                                      |
| `recipient`         | address                                                | merchant address                                          |
| `recipientType`     | `DESTINATION_CHAIN`, `INTENTS`, `CONFIDENTIAL_INTENTS` | where the merchant receives                               |
| `refundTo`          | address                                                | buyer refund address                                      |
| `refundType`        | `ORIGIN_CHAIN`, `INTENTS`, `CONFIDENTIAL_INTENTS`      | where a refund lands                                      |
| `slippageTolerance` | basis points                                           | `100` = 1%                                                |
| `deadline`          | ISO timestamp                                          | quote expiry; the deposit must be mined before it         |

`depositType` and `recipientType` are independent. A direct merchant delivery is `recipientType: DESTINATION_CHAIN`; the buyer can still deposit on `ORIGIN_CHAIN`.

The response includes:

- `depositAddress` - single-use deposit address on the origin chain
- `depositMemo` - required with the address on chains that use memos
- `amountIn`, `amountInFormatted`, `amountOut`, `amountOutFormatted`, `minAmountOut`
- `timeEstimate` - seconds after the deposit confirms
- `deadline`, `timeWhenInactive`
- `signature`, `correlationId`, `timestamp` - save the whole quote for dispute resolution
- `withdrawFee`, `refundFee`

`amountOut` is net of `withdrawFee`. x402Interop does not set an `appFees` entry and charges no application fee; any `appFees` in a raw 1Click response are 1Click's own fee.

## 3. Send the deposit

Transfer exactly `amountIn` of `originAsset` to `depositAddress` on the origin chain. Include `depositMemo` when present. The address is bound to the quote and becomes inactive at `deadline`.

The buyer pays origin-chain gas. 1Click does not take custody; funds move to the quote-specific deposit address and settle on-chain.

## 4. Submit the transaction hash (optional)

`POST https://1click.chaindefuser.com/v0/deposit/submit`

```json
{ "depositAddress": "0x...", "txHash": "0x..." }
```

This speeds up detection. It is not a substitute for the on-chain transfer.

## 5. Track status

`GET https://1click.chaindefuser.com/v0/status?depositAddress=...`

| Status               | Terminal | Meaning                                    |
| -------------------- | -------- | ------------------------------------------ |
| `PENDING_DEPOSIT`    | no       | Waiting for the origin transfer            |
| `KNOWN_DEPOSIT_TX`   | no       | Deposit detected, waiting for confirmation |
| `PROCESSING`         | no       | Swap executing                             |
| `SUCCESS`            | yes      | Output delivered to `recipient`            |
| `INCOMPLETE_DEPOSIT` | yes      | Deposit below the required amount          |
| `REFUNDED`           | yes      | Refunded to `refundTo`                     |
| `FAILED`             | yes      | Swap failed                                |

Poll until a terminal state. Do not treat `KNOWN_DEPOSIT_TX` or `PROCESSING` as delivery.

## 6. Refunds and fees

- Underpayment or a missed deadline: refund to `refundTo`.
- `EXACT_INPUT` overpayment: the swap runs and the excess is refunded after settlement.
- `EXACT_OUTPUT`: `amountIn` includes a slippage buffer; the unused input is refunded after settlement. Below `minAmountIn` the deposit is refunded.
- `refundFee` is charged in the origin asset. `withdrawFee` is already reflected in `amountOut`.
- Refunds are on the origin chain and are not instant.

An incomplete deposit or expired quote is not a delivery. Report the refund state separately.

## Direct delivery versus an Intents balance

`recipientType: DESTINATION_CHAIN` sends the output to the merchant's address on the destination chain. This is the only mode that lands directly in the merchant's on-chain wallet.

`recipientType: INTENTS` credits an account inside NEAR Intents. The merchant must sign a withdraw intent before the funds reach its on-chain wallet. 1Click now also quotes `DESTINATION_CHAIN` for an existing NEAR account, and x402Interop uses that mode exclusively: the seller is always paid at its final address, including `merchant.near` and 64-character implicit accounts. The direct route carries a `withdrawFee` for the final `ft_transfer`; the Intents route defers that cost until the merchant withdraws.

For x402Interop, the 402 `payTo` is the 1Click deposit address and `extra.recipient` is the merchant address. The buyer never pays the merchant directly in a cross-chain swap. `SUCCESS` means 1Click delivered to the merchant address; the facilitator's status record is the source of `deliverable`.

## Common failures

| Symptom                                                    | Cause                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `Quoting for this pair is not available`                   | no route, or `DESTINATION_CHAIN` requested for a chain that only supports `INTENTS` |
| `Temporary swap limits: minimum swap amount is $1,000`     | below 1Click's current corridor minimum (BNB Chain on 5 November 2026)              |
| `Incorrect depositMode for originAsset from stellar chain` | Stellar as an origin is not supported through this path                             |
| `Internal server error`                                    | 1Click route failure (Monad on 5 November 2026)                                     |
| `refundTo is not valid`                                    | refund address does not match the origin chain's format                             |
| `SUCCESS` but nothing in the merchant wallet               | destination was `INTENTS`, not `DESTINATION_CHAIN`                                  |

## Related

- [1Click route matrix](/reference/oneclick-route-matrix) - tested corridors and caveats.
- [Live canary](/guides/live-canary) - repeatable quote and deposit probe.
