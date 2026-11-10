// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import fs from 'node:fs/promises'
import path from 'node:path'

/** Slugs under `src/content/docs/<subdir>`, without the file extension. */
export async function docSlugs(subdir: string): Promise<string[]> {
  const root = path.resolve('./src/content/docs', subdir)
  return walk(root, '')
}

async function walk(dir: string, prefix: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      results.push(...(await walk(fullPath, relPath)))
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      results.push(relPath.replace(/\.(md|mdx)$/, ''))
    }
  }
  return results
}
