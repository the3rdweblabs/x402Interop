#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Discover x402interop services from the facilitator's catalogue.
 * Usage: node discover-services.mjs search [query] [--network id] [--asset id] [--facilitator url]
 *        node discover-services.mjs list [--facilitator url]
 *
 * The facilitator defaults to FACILITATOR_URL or http://127.0.0.1:4020.
 */

const args = process.argv.slice(2)
const command = args[0] || 'search'

function flag(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const facilitator = (
  flag('--facilitator') ||
  process.env.FACILITATOR_URL ||
  'http://127.0.0.1:4020'
).replace(/\/+$/, '')

if (command !== 'search' && command !== 'list') {
  console.error('Unknown command. Use: search [query] or list')
  process.exit(1)
}

const params = new URLSearchParams()
const query = command === 'search' && args[1] && !args[1].startsWith('--') ? args[1] : undefined
if (query) params.set('q', query)
const network = flag('--network')
const asset = flag('--asset')
const category = flag('--category')
const maxPrice = flag('--max-price')
const limit = flag('--limit')
if (network) params.set('network', network)
if (asset) params.set('asset', asset)
if (category) params.set('category', category)
if (maxPrice) params.set('maxPrice', maxPrice)
if (limit) params.set('limit', limit)

const url = `${facilitator}/discovery/resources${params.size > 0 ? `?${params}` : ''}`

const response = await fetch(url)
if (!response.ok) {
  console.error(`Discovery failed: ${response.status} ${response.statusText} from ${url}`)
  process.exit(1)
}

const body = await response.json()
const resources = Array.isArray(body.resources) ? body.resources : []
console.log(`=== x402interop services (${body.total ?? resources.length}) ===`)
console.log(url)
console.log()
if (resources.length === 0) {
  console.log('No listings.')
  process.exit(0)
}
for (const resource of resources) {
  console.log(`${resource.name}  ${resource.id}`)
  console.log(`  ${resource.resourceUrl}`)
  console.log(`  ${resource.price} ${resource.asset} on ${(resource.networks || []).join(', ')}`)
  if (resource.description) console.log(`  ${resource.description}`)
  console.log()
}
