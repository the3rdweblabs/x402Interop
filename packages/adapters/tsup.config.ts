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
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
