// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]
import { defineCollection, z } from 'astro:content'
import fs from 'node:fs/promises'
import path from 'node:path'

const docsRoot = path.resolve('./src/content/docs')

async function loadDocs() {
  const entries: Array<{ id: string; data: Record<string, unknown>; body: string }> = []

  async function walk(dir: string, prefix: string) {
    const files = await fs.readdir(dir, { withFileTypes: true })
    for (const file of files) {
      const fullPath = path.join(dir, file.name)
      const relPath = path.join(prefix, file.name)
      if (file.isDirectory()) {
        await walk(fullPath, relPath)
      } else if (file.name.endsWith('.md') || file.name.endsWith('.mdx')) {
        const body = await fs.readFile(fullPath, 'utf-8')
        const id = relPath.replace(/\.(md|mdx)$/, '')
        entries.push({ id, data: {}, body })
      }
    }
  }

  await walk(docsRoot, '')
  return entries
}

const docs = defineCollection({
  type: 'content_layer',
  loader: loadDocs,
  schema: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      sidebar: z.string().optional(),
      order: z.number().optional(),
      icon: z.string().optional(),
      active: z.string().optional(),
    })
    .passthrough(),
})

export const collections = { docs }
