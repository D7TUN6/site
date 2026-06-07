import path from 'node:path'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid({ include: [] })],
  build: {
    minify: 'esbuild',
    cssMinify: 'esbuild',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
