import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Frontend va API bir xil origin (localhost:5173) orqali ishlaydi: cookie sessiya birinchi tomon,
// CORS kerak emas. Productionda reverse proxy /v1 ni API konteyneriga yo'naltiradi.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    // 0.0.0.0 — wifi orqali boshqa qurilmalardan http://<kompyuter-IP>:5173 (backend .env da APP_ALLOW_LAN=1).
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3001', changeOrigin: false },
      '/health': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3001', changeOrigin: false },
    },
  },
  preview: { host: '0.0.0.0', port: 5173 },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
