/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // maplibre-gl pèse ~900 kB minifié à lui seul : seuil relevé en
    // connaissance de cause plutôt qu'un warning permanent.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
})
