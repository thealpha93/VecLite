import { copyFileSync } from 'fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: [/\.wasm$/],
  async onSuccess() {
    copyFileSync('src/wasm/veclite_bg.wasm', 'dist/veclite_bg.wasm')
  },
})
