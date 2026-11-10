// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]
import process from 'node:process'
import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'

if (process.env.X402_ENV === 'production') {
  const missing = ['PUBLIC_SITE_URL', 'PUBLIC_DOCS_URL'].filter((name) => !process.env[name])
  if (missing.length > 0) throw new Error(`Production build needs: ${missing.join(', ')}`)
}

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4322',
  output: 'static',
  trailingSlash: 'never',
  server: { port: 4322, host: '127.0.0.1' },
  preview: { port: 4322, host: '127.0.0.1' },
  integrations: [mdx()],
})
