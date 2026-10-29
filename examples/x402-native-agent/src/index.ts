// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { x402Client } from '@x402/fetch'
import { registerX402Interop } from '@x402interop/scheme-client'

/**
 * Example: Pure x402-native agent using @x402/fetch + x402Interop scheme client
 * This agent can pay resources that only advertise x402interop-* schemes
 */
export async function createNativeAgent(maxPriceCap?: string) {
  const client = new x402Client()
  registerX402Interop(client, { maxPriceCap })
  return client
}

export async function fetchWithInterop(url: string, maxPriceCap?: string) {
  const client = await createNativeAgent(maxPriceCap)
  // With @x402/fetch integration, this would use the registered scheme handlers
  const response = await fetch(url)
  
  if (response.status === 402) {
    console.log('Payment required - x402Interop agent can handle x402interop-* schemes')
    // In a real integration with @x402/fetch, payment would be handled automatically
  }
  
  return response
}

console.log('x402-native agent with x402Interop support initialized')
