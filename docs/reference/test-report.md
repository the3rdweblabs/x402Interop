<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# Test report

Runs that have been executed. A corridor appears here after a run. This page is not a settlement-time target, and it does not list pairs that have not been tried. The way to add a run is in [CONTRIBUTING.md](https://github.com/the3rdweblabs/x402Interop/blob/main/CONTRIBUTING.md).

Three kinds of result are kept separate:

| Kind | What happened |
| --- | --- |
| Mainnet payment | An origin transaction confirmed on Base. The resource then returned the report. |
| Hosted quote | The public facilitator priced a swap. Nothing was sent to the deposit address. |
| Simulator | The in-process 1Click double. No network call and no funds. |

Destination accounts on Sui and NEAR were not read back while this page was written. For `on_success`, the resource returns the body only after it accepts the swap as successful.

## Mainnet payments, 10 November 2026

The paying agent ran `MODE=live` against the resource example, also `MODE=live`. Both reports use `on_success`. The buyer was `0xd2B5d955271c761B50c2b4c2282455d65ECb4F05` on Base (`eip155:8453`), paying Base USDC. The resource called 1Click in-process. The configured payout accounts were Sui `0xa648265c54f20f93169a1d948f98ae58f8f17d86898b53b14330830a36e3e06f` and `x402interop.near`.

An output of 0.01 USDC was refused before these payments: `Amount is too low for bridge, try at least 149983` (0.149983 USDC), and no deposit address was created.

| Report | Seller receives | Base transfer confirmed | Deposit address paid on Base | Origin transaction | Base time (UTC) |
| --- | --- | --- | --- | --- | --- |
| Sui settlement report | 0.15 USDC on `sui:mainnet` | 0.171755 USDC | `0x9c832132CeAE0aD6702E75754Ec5f6D3B80aCAa1` | [`0xcee3090247c449a6acecb79e771d6caf47dda7f7e5182c86e740bb31d7cf0789`](https://basescan.org/tx/0xcee3090247c449a6acecb79e771d6caf47dda7f7e5182c86e740bb31d7cf0789) | 2026-11-10T13:13:25Z |
| NEAR settlement report | 0.15 USDC on `near:mainnet` | 0.156089 USDC | `0x00b666850a67987553693C47215A992cFFF63cF7` | [`0xcc8f26adf752338c02d650314024f1c360b3491e39fd424139ef01dea3f63d19`](https://basescan.org/tx/0xcc8f26adf752338c02d650314024f1c360b3491e39fd424139ef01dea3f63d19) | 2026-11-10T13:14:33Z |

Both receipts have status success. Each is a USDC transfer from the buyer, through the Base USDC contract, to the deposit address in that row. Those addresses are the single-use 1Click deposit on Base. They are not the Sui payout account and not `x402interop.near`. The agent then received each report.

## Hosted facilitator quotes, 11 November 2026

`https://x402interop-facilitator.up.railway.app` answered `/health`, listed 13 kinds on `/supported` (`exact` and `x402interop-evm`), and returned one discovery resource. Quotes below use `on_success`. Nothing was sent. Sui payouts use the Sui account from the mainnet run, NEAR payouts use `x402interop.near`, and EVM payouts use the Base buyer address. Solana and Aptos addresses in this batch are format-valid stand-ins created for the quote.

The output is 0.15 USDC except where 1Click refused that size. Ethereum USDC to Sui USDC at 0.15 returned `Amount is too low for bridge, try at least 299969` (0.299969 USDC). Solana USDC to Sui USDC at 0.15 returned `Amount is too low for bridge, try at least 223000` (0.223 USDC). Those two were quoted again at 0.30 and 0.223. An Intents deposit with the Base address as `refundTo` returned `refundTo is not valid`. The Intents row below uses `x402interop.near` as the refund address.

| Corridor | Buyer would send | Seller would receive | `withdrawFee` | Estimate | Quote |
| --- | --- | --- | --- | --- | --- |
| Base USDC to Sui USDC | 0.171755 USDC | 0.15 USDC | 0.02 USDC | 50s | `1click-ecb07200-686a-426d-ac5c-1e6c71400ebb` |
| Base USDC to NEAR USDC | 0.151549 USDC | 0.15 USDC | 0 | 35s | `1click-d211d451-9285-4fba-abb5-53ae0b265f03` |
| Arbitrum USDC to Sui USDC | 0.171755 USDC | 0.15 USDC | 0.02 USDC | 40s | `1click-d2a47a4c-d4df-4434-8b75-0f287b204d0c` |
| Ethereum USDC to Sui USDC | 0.3233 USDC | 0.30 USDC | 0.02 USDC | 60s | `1click-294a0a29-ba06-4f46-9e9f-ffcd10199535` |
| Optimism USDC to Sui USDC | 0.171755 USDC | 0.15 USDC | 0.02 USDC | 50s | `1click-e87cd678-caaa-4e7f-98a2-4ea12053d62f` |
| Polygon USDC to Sui USDC | 0.171755 USDC | 0.15 USDC | 0.02 USDC | 50s | `1click-0a72e7de-bb7f-4673-a7ea-8336639eda12` |
| Avalanche USDC to Sui USDC | 0.171755 USDC | 0.15 USDC | 0.02 USDC | 50s | `1click-e7c048d2-10ba-4ded-b691-705091f97ff3` |
| Berachain USDT0 to Sui USDC | 0.172257 USDT0 | 0.15 USDC | 0.02 USDC | 52s | `1click-4d77bb7b-5299-44cf-b2a6-fecf03bc3b90` |
| Plasma USDT0 to Sui USDC | 0.172257 USDT0 | 0.15 USDC | 0.02 USDC | 42s | `1click-044137ec-c27a-4b65-a7a3-e612691d5bb6` |
| X Layer USDC to Sui USDC | 0.172099 USDC | 0.15 USDC | 0.02 USDC | 35s | `1click-f0d567fd-c527-44cd-8735-ce729231e0f2` |
| Scroll USDT to Sui USDC | 0.172257 USDT | 0.15 USDC | 0.02 USDC | 42s | `1click-950b3bf8-8ca3-4bba-8b97-a6040ef3a6a4` |
| Solana USDC to Sui USDC | 0.245507 USDC | 0.223 USDC | 0.02 USDC | 35s | `1click-521cd1f3-0644-49b0-8f1d-9f791eead2b4` |
| Aptos USDC to Sui USDC | 0.172081 USDC | 0.15 USDC | 0.02 USDC | 40s | `1click-2465d830-ea1a-438c-a011-6055ccbe8ff5` |
| NEAR USDC to Sui USDC | 0.171755 USDC | 0.15 USDC | 0.02 USDC | 35s | `1click-b285190e-7d13-4d97-be0f-5f09e04517fc` |
| Monad USDC to Sui USDC | 0.172099 USDC | 0.15 USDC | 0.02 USDC | 35s | `1click-ad22ff8e-6cc1-4dfb-86a5-21c6c44de0e1` |
| Base USDC to Ethereum USDC | 0.45464 USDC | 0.15 USDC | 0.30 USDC | 42s | `1click-c9e54e52-fa84-4eab-9f1d-83161cb3e057` |
| Base USDC to Arbitrum USDC | 0.156904 USDC | 0.15 USDC | 0.0053 USDC | 34s | `1click-b2101dfe-84b9-40d9-83c9-0dec5fc8fd42` |
| Base USDC to Solana USDC | 0.374785 USDC | 0.15 USDC | 0.223236 USDC | 32s | `1click-46f11850-baf2-445c-a3e3-180770077236` |
| Base USDC to Aptos USDC | 0.166724 USDC | 0.15 USDC | 0.014887 USDC | 50s | `1click-978f1600-4987-446b-a84d-4f41aa1c175c` |
| Sui USDC to NEAR USDC | 0.151549 USDC | 0.15 USDC | 0 | 25s | `1click-b9826998-45a2-4d00-b2e3-597b2442e30e` |
| Base USDC to NEAR USDC, Intents deposit | 0.151549 USDC | 0.15 USDC | 0 | 10s | `1click-fe2603ff-4087-4f77-8bab-33e7c65248f1` |

The Base to Sui price matched the payment from 10 November. The Base to NEAR price did not: that payment was 0.156089 USDC. Quote amounts move between requests. Every quote in this table included a deposit address and was left unpaid. A 0.15 USDC payout on Ethereum or Solana is a poor size: the withdraw fee alone was 0.30 USDC to Ethereum and 0.223236 USDC to Solana.

## Simulator, 11 November 2026

| Check | Command result | What it shows |
| --- | --- | --- |
| Resource example | `examples/resource` tests, 7 passed | The Sui report returns `402` with a quote. The NEAR report accepts a signed simulated payment and returns `200` with the report. |
| Delivery modes | `packages/facilkit` interop-status tests, 17 passed | `on_deposit` is deliverable once the deposit is seen. `on_success` stays undeliverable until `SUCCESS`, and settle is refused while the swap is pending. `pending_push` stays undeliverable until `SUCCESS`. |
| Seller middleware | `packages/servers` middleware tests, 32 passed | `pending_push` returns `202` and does not serve while the swap is processing. `on_deposit` serves once the deposit is secured. |

## Not run

Lightning, Stellar, BNB Chain, and the UTXO chains were not requested. Quoted pairs from the earlier dry-quote matrix are in the [1Click route matrix](oneclick-route-matrix.md).
