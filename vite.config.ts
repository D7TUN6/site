import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import compression from "vite-plugin-compression2";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    vue(),
    compression({
      algorithms: ["brotliCompress"],
      exclude: [/\.(?:png|jpe?g|webp|avif|mp3|ogg|wav|flac|zip)$/i],
      deleteOriginalAssets: false
    }),
    compression({
      algorithms: ["gzip"],
      exclude: [/\.(?:png|jpe?g|webp|avif|mp3|ogg|wav|flac|zip)$/i],
      deleteOriginalAssets: false
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  build: {
    cssCodeSplit: true,
    sourcemap: false,
    target: "es2022"
  },
  server: {
    host: "127.0.0.1",
    port: 3001,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3002",
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 3001
  }
});
