import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: proxy /api sang backend để frontend và API cùng origin — cookie phiên
// gửi kèm được mà không phải bật CORS hay dùng SameSite=None.
// Deploy: build ra dist/ rồi để backend (hoặc nginx) phục vụ, cũng cùng origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
