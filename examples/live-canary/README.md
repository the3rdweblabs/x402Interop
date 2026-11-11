<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# x402Interop live canary

A mainnet transport check for one corridor. It mints a real NEAR Intents (1Click) quote, optionally sends the origin leg, and polls the swap to a terminal state.

There is no NEAR Intents testnet. Every send is a mainnet transfer.

## Safety

- Quote-only by default. No transaction is signed or sent.
- Sending requires both `CANARY_SEND=true` and `CANARY_CONFIRM=send-mainnet`.
- Automatic sending works for EVM origins only. For Solana, Sui, NEAR, and Stellar, pay the printed deposit address from your own wallet.
- Start with a micro amount.

## Build and quote

From the repository root:

```sh
pnpm install
pnpm --filter live-canary build
pnpm --filter live-canary canary -- --list-assets
cp examples/live-canary/.env.example examples/live-canary/.env
```

Edit `.env`, then run a quote:

```sh
pnpm --filter live-canary canary -- --json
```

A Base USDC to Sui USDC example:

```sh
CANARY_ORIGIN_NETWORK=base \
CANARY_DEST_NETWORK=sui:mainnet \
CANARY_ORIGIN_ASSET=USDC \
CANARY_DEST_ASSET=USDC \
CANARY_AMOUNT=200000 \
CANARY_ORIGIN_ADDRESS=0x1111111111111111111111111111111111111111 \
CANARY_DEST_ADDRESS=0x0000000000000000000000000000000000000000000000000000000000000001 \
pnpm --filter live-canary canary -- --json
```

Replace both addresses with wallets you control before sending; the placeholders above are only for a dry quote. The output includes the quote, the canonical 402 body, the `PAYMENT-REQUIRED` header, the single-use deposit address, and the final status.

## Send

```sh
CANARY_SEND=true \
CANARY_CONFIRM=send-mainnet \
CANARY_WAIT=true \
pnpm --filter live-canary canary -- --send --wait
```

Exit codes: `0` for `SUCCESS`, `1` for any other terminal status or an error, and `2` when the poll deadline passes first.

## Manual payment from a non-EVM origin

Leave `CANARY_ORIGIN_PRIVATE_KEY` empty and set `CANARY_ORIGIN_ADDRESS` to your wallet. Run with `--wait`; the first stderr line prints the deposit address, memo (if the chain needs one), and quote expiry. Pay that address from your wallet before it expires.

## Full guide

See [docs/guides/live-canary.md](../../docs/guides/live-canary.md) for the complete configuration table, status meanings, and route notes.
