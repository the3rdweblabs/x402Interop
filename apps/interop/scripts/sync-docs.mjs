// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * Copy the repository-level docs into the Astro content directory and
 * rewrite repository-relative links to the routes the docs site serves.
 * The generated directory is ignored by Git; `docs/` is the only source.
 */

import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '../..')
const source = path.join(repoRoot, 'docs')
const target = path.join(appRoot, 'src/content/docs')
const WHITEPAPER = 'x402Interop Whitepaper.pdf'

const replacements = [
  ['](/guides/', '](/docs/guides/'],
  ['](/reference/', '](/docs/reference/'],
  ['](/concept/', '](/docs/concept/'],
  ['](/internal/', '](/docs/internal/'],
  ['](/intro)', '](/docs/intro)'],
  ['](/specs/schemes)', '](/docs/specs/schemes/README)'],
  ['](/specs/', '](/docs/specs/'],
]

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(fullPath)))
    else files.push(fullPath)
  }
  return files
}

/**
 * Files that stay in the repo but never reach the public site. Internal notes
 * are working documents for contributors; the PDF is served from public/.
 */
const PRIVATE = ['internal', 'llms.txt', WHITEPAPER]

function isPublic(file) {
  const rel = path.relative(source, file)
  return !PRIVATE.some((name) => rel === name || rel.startsWith(name + path.sep))
}

await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true, filter: isPublic })
await cp(path.join(source, WHITEPAPER), path.join(appRoot, 'public/x402interop-whitepaper.pdf'))

for (const file of await walk(target)) {
  if (!file.endsWith('.md') && !file.endsWith('.mdx') && !file.endsWith('.txt')) continue
  const original = await readFile(file, 'utf8')
  let next = original
  for (const [from, to] of replacements) next = next.replaceAll(from, to)
  // MDX has no HTML comments: `<!-- -->` is a parse error. The provenance
  // header in `docs/*.mdx` is an HTML comment, so rewrite it to the MDX
  // equivalent after copying. Markdown keeps the HTML form, which is valid.
  if (file.endsWith('.mdx')) next = htmlCommentsToMdx(next)
  if (next !== original) await writeFile(file, next)
}

// Rewrites top-level HTML comment blocks to the MDX equivalent.
function htmlCommentsToMdx(source) {
  return source.replace(/<!--\n([\s\S]*?)\n-->/g, (_match, body) => `{/*\n${body}\n*/}`)
}
