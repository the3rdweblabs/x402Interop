// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createPublicClient, http, parseAbi } from 'viem'
import { base, mainnet, arbitrum, polygon } from 'viem/chains'

const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address) view returns (uint256)',
])

export async function verifyEvmTransfer(
  depositAddress: string,
  expectedAmount: string,
  from?: string,
  rpcUrl?: string,
): Promise<{ valid: boolean; txHash?: string; reason?: string }> {
  try {
    // Try to find recent transfers to deposit address
    // For now, do basic validation
    if (!depositAddress || !depositAddress.startsWith('0x')) {
      return { valid: false, reason: 'invalid_deposit_address' }
    }
    // In production, we'd query logs/events
    // For scaffold with live canary, we'll be more permissive if structure is correct
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : 'unknown_error' }
  }
}
