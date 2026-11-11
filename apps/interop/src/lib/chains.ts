// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Chain names for the landing page strip, read from the chain reference at
 * build time so the strip cannot drift from the docs. Only rows in the
 * "Network matrix" tables count; principles and asset tables are skipped.
 */
export function dayOneChains(): string[] {
  const file = path.resolve('./src/content/docs/reference/chains-and-assets.md')
  const lines = readFileSync(file, 'utf8').split('\n')
  const names: string[] = []
  let inMatrix = false
  let inTable = false
  for (const line of lines) {
    if (line.startsWith('## ')) inMatrix = line.startsWith('## Network matrix')
    if (line.startsWith('### ')) inTable = false
    if (!inMatrix) continue
    if (!line.startsWith('|')) {
      inTable = false
      continue
    }
    if (/^\|\s*-+/.test(line)) continue
    const first = line.split('|')[1]?.trim() ?? ''
    if (!inTable) {
      inTable = true
      continue
    }
    const name = first
      .replace(/\*\*/g, '')
      .replace(/\s*\(default\)\s*/i, '')
      .trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}
