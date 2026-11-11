// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createOneClickClient } from '@x402interop/intents'

import { listCatalogue } from './assets.js'
import { encodePaymentRequiredHeader, runCanary, type CanaryResult } from './canary.js'
import { readCanaryConfig, SEND_CONFIRMATION } from './config.js'
import { payEvmOrigin } from './evm-payer.js'

const HELP = `x402Interop live canary

Environment is the source of truth; see .env.example and docs/guides/live-canary.md.

  --list-assets   print the curated 26-chain / 74-asset catalogue
  --send          send the origin payment (also needs CANARY_CONFIRM=${SEND_CONFIRMATION})
  --wait          poll 1Click until a terminal state
  --quote-dry     price only; no deposit address and no 402 body
  --json          print one JSON object instead of labelled sections
  --help          this message

Defaults: quote only, never send. There is no NEAR Intents testnet.
`

function printResult(result: CanaryResult): void {
  console.log('\nQuote')
  console.log(
    JSON.stringify(
      {
        quoteId: result.quote.quoteId,
        originAmount: result.quote.originAmount,
        destinationAmount: result.quote.destinationAmount,
        minAmountIn: result.quote.minAmountIn,
        withdrawFee: result.quote.withdrawFee,
        refundFee: result.quote.refundFee,
        amountInFormatted: result.quote.amountInFormatted,
        amountOutFormatted: result.quote.amountOutFormatted,
        depositAddress: result.quote.depositAddress,
        depositMemo: result.quote.depositMemo,
        expiresAt: result.quote.expiresAt,
        timeEstimateSeconds: result.quote.timeEstimateSeconds,
      },
      null,
      2,
    ),
  )

  if (result.paymentRequired) {
    console.log('\n402 Payment Required body')
    console.log(JSON.stringify(result.paymentRequired, null, 2))
    console.log('\nPAYMENT-REQUIRED header (base64)')
    console.log(encodePaymentRequiredHeader(result.paymentRequired))
  }

  if (result.paymentPayload) {
    console.log('\nPAYMENT-SIGNATURE payload (base64)')
    console.log(Buffer.from(JSON.stringify(result.paymentPayload)).toString('base64'))
  }

  console.log('\nResult')
  console.log(
    JSON.stringify(
      {
        finalStatus: result.finalStatus,
        timedOut: result.timedOut,
        originTxHash: result.originTxHash,
        receipt: result.receipt,
      },
      null,
      2,
    ),
  )
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2))
  if (args.has('--help')) {
    console.log(HELP)
    return 0
  }
  if (args.has('--list-assets')) {
    console.log(listCatalogue().join('\n'))
    return 0
  }

  const config = readCanaryConfig(process.env, {
    ...(args.has('--send') ? { send: true } : {}),
    ...(args.has('--wait') ? { wait: true } : {}),
    ...(args.has('--quote-dry') ? { quoteDry: true } : {}),
  })
  const client = createOneClickClient({
    type: 'live',
    baseUrl: config.oneClickBaseUrl,
    ...(config.oneClickApiKey ? { apiKey: config.oneClickApiKey } : {}),
  })
  const result = await runCanary(config, {
    client,
    payer: payEvmOrigin,
    log: (line) => console.error(line),
  })

  if (args.has('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    printResult(result)
  }

  if (result.timedOut) return 2
  return result.finalStatus === 'SUCCESS' ? 0 : 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
