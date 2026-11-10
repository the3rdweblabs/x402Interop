// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import process from 'node:process'
import { defineConfig } from 'astro/config'

const REQUIRED_IN_PRODUCTION = ['PUBLIC_SITE_URL', 'PUBLIC_FACILITATOR_URL', 'PUBLIC_DOCS_URL']
if (process.env.X402_ENV === 'production') {
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name])
  if (missing.length > 0) throw new Error(`Production build needs: ${missing.join(', ')}`)
}

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'never',
  server: { port: 4321, host: '127.0.0.1' },
  preview: { port: 4321, host: '127.0.0.1' },
})
