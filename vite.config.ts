import path from 'node:path'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    minify: 'esbuild',
    cssMinify: 'esbuild',
      rolldownOptions: {
        checks: { pluginTimings: false },
        output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/hls.js')) return 'hls'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
