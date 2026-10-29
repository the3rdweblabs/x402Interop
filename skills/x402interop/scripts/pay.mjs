#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS
// [native]

/**
 * Pay for a resource with hard price cap enforcement
 * Usage: node pay.mjs <url> --max-price <amount> [--method GET]
 */

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node pay.mjs <url> --max-price <amount> [--method GET|POST]')
  process.exit(1)
}

const url = args[0]
const maxPriceIndex = args.indexOf('--max-price')
const maxPrice = maxPriceIndex >= 0 ? args[maxPriceIndex + 1] : null
const methodIndex = args.indexOf('--method')
const method = methodIndex >= 0 ? args[methodIndex + 1] : 'GET'

async function pay() {
  try {
    console.log('Fetching resource...')
    const res = await fetch(url, { method })

    if (res.status !== 402) {
      console.log(`Status: ${res.status}`)
      console.log('Resource accessible without payment')
      return
    }

    // Decode payment required
    let paymentRequired
    const header =
      res.headers.get('payment-required') || res.headers.get('PAYMENT-REQUIRED')
    if (header) {
      try {
        const decoded = Buffer.from(header, 'base64').toString('utf-8')
        paymentRequired = JSON.parse(decoded)
      } catch {
        paymentRequired = await res.json()
      }
    } else {
      paymentRequired = await res.json()
    }

    console.log('\n=== Payment Required ===')
    for (const accept of paymentRequired.accepts || []) {
      console.log(`Scheme: ${accept.scheme}`)
      console.log(`Network: ${accept.network}`)
      console.log(`Amount: ${accept.amount}`)
      if (accept.extra?.displayPrice) console.log(`Price: ${accept.extra.displayPrice}`)
      if (accept.extra?.quoteId) console.log(`Quote ID: ${accept.extra.quoteId}`)
      if (accept.extra?.depositAddress) console.log(`Deposit: ${accept.extra.depositAddress}`)
      console.log()
    }

    if (maxPrice) {
      console.log(`Enforcing hard price cap: ${maxPrice}`)
      for (const accept of paymentRequired.accepts || []) {
        if (BigInt(accept.amount) > BigInt(maxPrice)) {
          console.error(`\n❌ Price exceeds hard cap! ${accept.amount} > ${maxPrice}`)
          process.exit(1)
        }
      }
      console.log('✓ Price within cap')
    } else {
      console.log('⚠️  No price cap set. Use --max-price to enforce a hard cap.')
    }

    console.log('\n=== Next Steps ===')
    console.log('1. Confirm refund destination with user')
    console.log('2. Ensure sufficient balance on buyer chain')
    console.log('3. Sign and send payment to deposit address')
    console.log('4. Track status via GET /interop/status/<quoteId>')
    console.log('\nNote: This is a preview script. Actual payment signing not implemented.')
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

pay()
