import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server proxies /api to the FastAPI backend so the browser stays same-origin.
// The MRM API runs on :8001 locally (:8000 is occupied by Sieger Design
// Operations since 2026-08-21). Render production binds $PORT and is unaffected.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8001', changeOrigin: true },
    },
  },
})
