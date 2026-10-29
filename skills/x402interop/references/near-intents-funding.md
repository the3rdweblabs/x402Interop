# NEAR Intents Funding Guide

NEAR Intents (via 1Click API) enables cross-chain settlement for x402interop payments. Since there is **no Intents testnet**, all testing must be done on mainnet with small amounts.

## Key Facts

- **No testnet available** - Test with micro amounts on mainnet
- **Unauthenticated fee**: ~0.2% per swap
- **Partner JWT**: Server-side only, never expose to clients
- **Single-use deposit addresses**: Each quote gets its own deposit address
- **Asset IDs**: Look like `nep141:<chain>-<address>.omft.near` - verify with `GET /v0/tokens`

## Funding Flow

1. **Get a quote** from facilitator (`POST /interop/quote`) - you'll receive `depositAddress`, `quoteId`, `expiresAt`, `refundTo`
2. **Confirm price and refund destination** - ALWAYS confirm these with the user before proceeding
3. **Send funds to deposit address** from buyer's origin chain
4. **Track status** via `GET /interop/status/<quoteId>` or directly via 1Click status
5. **Wait for settlement** - delivery depends on seller's `deliveryMode` (`on_deposit`, `on_success`, `pending_push`)

## Safety Rules

- **Always show price before paying** - Use `check-price.mjs` or inspect the 402
- **Enforce hard price cap** - Never pay more than confirmed price
- **Confirm refund destination** - Verify `refundTo` address and chain with user before depositing
- **Check expiry** - Quotes expire (default 5 minutes). Don't send funds after expiry
- **Use small amounts for testing** - Start with $0.01 or equivalent
- **Never log secrets** - API keys, private keys must never be logged

## Storage Deposits

Some chains/tokens may require storage deposits. Check the 1Click quote response and ensure your wallet has sufficient balance for:
- The swap amount
- Gas fees on origin chain
- Any required storage deposits
- NEAR Intents fees (~0.2%)

## Finding Asset IDs

Asset IDs change over time. Always confirm the live set:
```bash
curl https://1click.chaindefuser.com/v0/tokens
```

Look for your origin and destination assets.

## Troubleshooting

- **Deposit not seen**: Ensure transaction was confirmed on origin chain and sent to the exact deposit address
- **Quote expired**: Get a new quote from facilitator
- **Refunded**: Funds returned to `refundTo`. Check why (insufficient liquidity, invalid path, etc.)
- **INCOMPLETE_DEPOSIT**: Sent wrong amount or wrong asset

## Mainnet Canary Testing

Since there's no testnet:
1. Set up facilitator and seller locally
2. Use a real wallet with small balance
3. Do a micro payment ($0.01)
4. Monitor status closely
5. Document any issues for adjustment
6. Never automate this - always manual
