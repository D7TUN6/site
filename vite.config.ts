import path from "node:path";
import { execSync } from "node:child_process";
import zlib from "node:zlib";
import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv, type Plugin } from "vite";

const PRECOMPRESS_RE = /\.(?:js|css|html|json|svg|txt|xml|map|woff2?|ico)$/i;

function readPort(input: unknown, fallback: number): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

function readBool(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const value = input.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function readBuildTag(): string {
  try {
    const gitHash = execSync("git rev-parse --short=12 HEAD", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString("utf8")
      .trim();

    if (gitHash) {
      return gitHash;
    }
  } catch {
    // Fall through to a timestamp-based tag.
  }

  return String(Date.now());
}

function precompressAssetsPlugin(): Plugin {
  return {
    name: "precompress-assets",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (!PRECOMPRESS_RE.test(fileName)) continue;

        const raw =
          output.type === "chunk"
            ? output.code
            : typeof output.source === "string"
              ? output.source
              : output.source instanceof Uint8Array
                ? Buffer.from(output.source)
                : output.source;

        if (!raw) continue;

        const buffer =
          typeof raw === "string"
            ? Buffer.from(raw)
            : raw instanceof Uint8Array
              ? Buffer.from(raw)
              : Buffer.from(String(raw));

        const brotli = zlib.brotliCompressSync(buffer, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11
          }
        });
        const gzip = zlib.gzipSync(buffer);

        this.emitFile({ type: "asset", fileName: `${fileName}.br`, source: brotli });
        this.emitFile({ type: "asset", fileName: `${fileName}.gz`, source: gzip });
      }
    }
  };
}

export default defineConfig(async ({ mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), ""),
    ...process.env
  };

  const isProd = mode === "production";
  const webPort = readPort(env.WEB_PORT, 3001);
  const apiPort = readPort(env.API_PORT, 3002);
  const webHost = typeof env.WEB_HOSTNAME === "string" && env.WEB_HOSTNAME.trim() ? env.WEB_HOSTNAME.trim() : "127.0.0.1";
  const shouldAnalyze = readBool(env.ANALYZE);
  const analyzePath =
    typeof env.ANALYZE_PATH === "string" && env.ANALYZE_PATH.trim()
      ? env.ANALYZE_PATH.trim()
      : typeof env.STATS_PATH === "string" && env.STATS_PATH.trim()
        ? env.STATS_PATH.trim()
        : "tmp/vite-bundle-report.html";
  const buildTag = readBuildTag();

  const plugins = [vue()];

  if (shouldAnalyze) {
    const { visualizer } = await import("rollup-plugin-visualizer");
    plugins.push(
      visualizer({
        filename: analyzePath,
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        open: false
      }) as unknown as Plugin
    );
  }

  plugins.push(precompressAssetsPlugin());

  return {
    plugins,
    define: {
      __VUE_OPTIONS_API__: JSON.stringify(false),
      __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false)
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    server: {
      host: webHost,
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: !isProd,
      copyPublicDir: false,
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name]-[hash]-${buildTag}.js`,
          chunkFileNames: `assets/[name]-[hash]-${buildTag}.js`,
          assetFileNames: (assetInfo) => {
            const baseName = assetInfo.name ? path.basename(assetInfo.name, path.extname(assetInfo.name)) : "asset";
            const ext = assetInfo.name ? path.extname(assetInfo.name) : "";
            return `assets/${baseName}-[hash]-${buildTag}${ext}`;
          }
        }
      }
    }
  };
});
