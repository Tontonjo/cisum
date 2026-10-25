// Cisum web player build configuration v0.11.3
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.CISUM_BACKEND || 'http://localhost:6874'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: { '^/(auth|api|rest)/.*': backend },
  },
})
