import path from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      ...mdx()
    },
    react({
      include: /\.(mdx|js|jsx|ts|tsx)$/
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
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
