<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# marketplace

Astro marketplace over the running facilitator.

```sh
pnpm --filter marketplace build
pnpm --filter marketplace start
```

The app serves <http://127.0.0.1:4321> and calls `PUBLIC_FACILITATOR_URL` (default `http://127.0.0.1:4020`) from the browser. Start the facilitator first. The facilitator allows this origin by default.

## Configuration

Both variables are public and are inlined at build time, so a deployed build needs its own `pnpm build`.

- `PUBLIC_FACILITATOR_URL`: facilitator base URL the browser calls.
- `PUBLIC_DOCS_URL`: docs site linked from the nav (default `http://127.0.0.1:4322`).

Never put API keys, JWTs, or relayer keys in these variables.

## Wallets and signing

Listing writes are signed per action. Connect a browser-extension wallet from the nav:

- **EVM:** any EIP-6963 wallet (MetaMask, Rabby, and others), with `window.ethereum` as fallback.
- **Sui and Solana:** any Wallet Standard extension (Slush, Phantom, Solflare, Backpack, and others).
- **Not yet:** NEAR in the browser (the facilitator verifies NEAR signatures, but there is no connector) and mobile wallets via WalletConnect. Both are follow-ups.

Each save requests a single-use challenge bound to that exact method, path, and body. The wallet signs it, and the facilitator checks the signature. The owner is the verified address, and the challenge expires after five minutes.

Pages: `/register` lists or edits a service, `/listings` manages your own services (health check, delete), and `/service` links to a quote with the seller and amount prefilled. The prefill assumes the owner's address is the payout address, which holds for EVM, Sui, and Solana owners.

## Legal

`/terms` and `/privacy` are drafts with placeholders for the operator, contact, jurisdiction, and retention periods. They must be reviewed by counsel before launch.

## Mainnet deployment

Before pointing the app at a mainnet facilitator:

- The facilitator's `FACILITATOR_CORS_ORIGINS` must include the deployed marketplace origin. The local default does not cover it.
- Set `PUBLIC_FACILITATOR_URL` and `PUBLIC_DOCS_URL` to the deployed hosts, then rebuild.
- Set `MARKETPLACE_DOMAIN` on the facilitator to the public host. It appears in every sign-in message, and a mismatch will confuse users.
- Keep `MARKETPLACE_FREE_LISTINGS=true` (fees are zero). A fee amount of `"0"` is also treated as free.
- Quote addresses are checked for the chain family (EVM, Sui, Solana). Other families are passed to the facilitator unchecked.
- Listing `resourceUrl`s are only linked when they are `http(s)`. The facilitator's own URL validation accepts other schemes; see the facilkit review notes.
