// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { defineConfig, type Options } from 'tsup'

const entry = ['src/index.ts', 'src/express.ts', 'src/hono.ts', 'src/fastify.ts', 'src/next.ts']

// Every upstream `@x402/*` package, the workspace scope, the frameworks the
// subpaths bind to, and zod are kept external: the subpaths must resolve their
// peers at runtime, and the root must never force a framework peer to load.
const external = [/^@x402interop\//, /^@x402\//, 'express', 'hono', 'fastify', 'next', 'zod']

export default defineConfig({
  entry,
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  platform: 'node',
  target: 'es2022',
  external,
  // Flat dist: `dist/express.js`, `dist/express.cjs`, `dist/express.d.ts` -
  // the package.json exports map points at exactly these paths.
  outExtension: (ctx) => ({ js: ctx.format === 'cjs' ? '.cjs' : '.js' }),
} satisfies Options)
