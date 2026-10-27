// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { defineConfig, type Options } from 'tsup'

const external = [/^@x402interop\//, 'zod', 'viem']

const shared = {
  entry: ['src/index.ts', 'src/cli.ts'],
  target: 'es2022',
  sourcemap: true,
  splitting: false,
  platform: 'node',
  external,
} satisfies Options

export default defineConfig([
  {
    ...shared,
    format: ['esm'],
    dts: true,
    clean: true,
    outDir: 'dist/esm',
  },
  {
    ...shared,
    format: ['cjs'],
    clean: false,
    outDir: 'dist/cjs',
    outExtension: () => ({ js: '.cjs' }),
  },
])
