import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: resolve(__dirname, '../../dist/cursor-ui'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    }
  },
  server: {
    port: 3002,
    proxy: { '/api': 'http://localhost:3001' }
  }
})
