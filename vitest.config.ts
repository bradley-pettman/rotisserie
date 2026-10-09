import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@rotisserie/shared': fileURLToPath(new URL('./packages/shared/src', import.meta.url))
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'packages/**/*.test.ts'],
    environment: 'node'
  }
})
