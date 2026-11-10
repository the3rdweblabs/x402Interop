// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/evm/index.ts',
    'src/svm/index.ts',
    'src/sui/index.ts',
    'src/near/index.ts',
    'src/ton/index.ts',
    'src/tron/index.ts',
    'src/xrpl/index.ts',
    'src/lightning/index.ts',
    'src/aptos/index.ts',
    'src/stellar/index.ts',
    'src/starknet/index.ts',
    'src/utxo/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
