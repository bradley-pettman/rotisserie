import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    // Unit tests sit next to the code they test.
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
