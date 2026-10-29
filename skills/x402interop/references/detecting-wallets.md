# Detecting Wallets (x402Interop)

To choose how to sign a payment, check the environment in order of preference:

1. **Agentic/managed wallets** (if available in environment): e.g. Coinbase Agentic Wallet (awal), CDP, Privy, Turnkey. Look for their env vars or CLI login state.
2. **Raw private key**: check for `X402_PRIVATE_KEY` (preferred), `PRIVATE_KEY`, `WALLET_PRIVATE_KEY`, `ETH_PRIVATE_KEY`, or `AGENT_PRIVATE_KEY`. If found and you need to sign, use `@x402/evm` or appropriate scheme client with that key.
3. **Injected/browser wallets**: if running in a browser context, prefer injected provider (EIP-1193) and ask user to connect/sign.

## Environment variables

- `X402_PRIVATE_KEY` - Raw secp256k1 private key (hex, with or without 0x). Store only in `.env`, never commit.
- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `CDP_WALLET_ADDRESS` - Coinbase CDP SDK
- `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_WALLET_ID`, `PRIVY_WALLET_ADDRESS` - Privy
- `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY`, `TURNKEY_ORGANIZATION_ID`, `TURNKEY_SIGN_WITH` - Turnkey
- `BASE_RPC_URL`, `BASE_RPC_KEY` - RPC overrides for EVM chains

## Rules
- Never search for keys in files outside of explicit env loading. If auth missing/expired, stop and tell user how to log in.
- Prefer managed wallets over raw keys when available.
- For EVM buyers, payments are typically gasless authorizations (EIP-3009) submitted via facilitator; you still need to sign the typed data.
