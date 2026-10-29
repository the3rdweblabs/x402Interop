#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS
// [native]

/**
 * Check price without paying - fetch a URL and inspect 402 Payment Required
 * Shows price before paying as per safety rules.
 */

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node check-price.mjs <url> [--method GET|POST] [--body ...]')
  process.exit(1)
}

const url = args[0]
const methodIndex = args.indexOf('--method')
const method = methodIndex >= 0 ? args[methodIndex + 1] : 'GET'
const bodyIndex = args.indexOf('--body')
const body = bodyIndex >= 0 ? args[bodyIndex + 1] : undefined

async function checkPrice() {
  try {
    const headers = {}
    if (body) {
      headers['content-type'] = 'application/json'
    }

    const res = await fetch(url, {
      method,
      headers,
      body,
    })

    if (res.status !== 402) {
      console.log(`Status: ${res.status} ${res.statusText}`)
      console.log('Not a 402 Payment Required response')
      if (res.status < 400) {
        console.log('Resource is accessible without payment')
      }
      return
    }

    console.log('=== 402 Payment Required ===')
    console.log(`URL: ${url}`)
    console.log()

    // Check for PAYMENT-REQUIRED header (x402 v2)
    const paymentRequiredHeader =
      res.headers.get('payment-required') || res.headers.get('PAYMENT-REQUIRED')
    if (paymentRequiredHeader) {
      try {
        const decoded = Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8')
        const parsed = JSON.parse(decoded)
        console.log('Payment Required (from header):')
        console.log(JSON.stringify(parsed, null, 2))
      } catch (e) {
        console.log('Payment Required header (raw):', paymentRequiredHeader)
      }
    }

    // Check body
    try {
      const bodyText = await res.text()
      if (bodyText) {
        const parsed = JSON.parse(bodyText)
        console.log('\nPayment Required (from body):')
        console.log(JSON.stringify(parsed, null, 2))

        // Extract price info
        if (parsed.accepts && Array.isArray(parsed.accepts)) {
          console.log('\n=== Price Summary ===')
          for (const accept of parsed.accepts) {
            console.log(`Scheme: ${accept.scheme}`)
            console.log(`Network: ${accept.network}`)
            console.log(`Asset: ${accept.asset}`)
            console.log(`Amount: ${accept.amount}`)
            if (accept.extra?.displayPrice) {
              console.log(`Display Price: ${accept.extra.displayPrice}`)
            }
            console.log()
          }
        }
      }
    } catch (e) {
      // ignore
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

checkPrice()
