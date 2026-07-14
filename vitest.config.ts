import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Standalone config for unit tests. Deliberately not based on vite.config.ts:
// the Cloudflare plugin rejects vitest's server options, and the Playwright
// specs in tests/ must not be picked up by vitest.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'better-auth'],
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
