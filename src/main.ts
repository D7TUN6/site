import { createApp } from "vue";
import App from "@/App.vue";
import router from "@/router";
import "@/styles/globals.css";

const CHUNK_RELOAD_KEY = "site-chunk-reload-attempted";

function shouldReloadForChunkError(reason: unknown): boolean {
  if (!reason) return false;

  if (reason instanceof Error) {
    if (reason.name === "ChunkLoadError") return true;
    if (/Loading chunk \d+ failed/i.test(reason.message)) return true;
    if (/ChunkLoadError/i.test(reason.message)) return true;
  }

  if (typeof reason === "object") {
    const candidate = reason as { name?: unknown; message?: unknown };
    if (typeof candidate.name === "string" && candidate.name === "ChunkLoadError") return true;
    if (typeof candidate.message === "string" && /Loading chunk \d+ failed/i.test(candidate.message)) return true;
  }

  return false;
}

function tryReloadOnce(): void {
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") {
      return;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch (error) {
    void error;
  }

  window.location.reload();
}

function installChunkLoadAutoReload(): void {
  window.addEventListener("unhandledrejection", (event) => {
    if (shouldReloadForChunkError(event.reason)) {
      tryReloadOnce();
    }
  });

  window.addEventListener("error", (event) => {
    if (event instanceof ErrorEvent && shouldReloadForChunkError(event.error || event.message)) {
      tryReloadOnce();
    }
  });
}

import { fetchAndApplyBg } from "@/lib/background";

installChunkLoadAutoReload();

void fetchAndApplyBg();

fetch("/api/palette/active", { cache: "no-store" })
  .then((r) => r.json())
  .then((data: { vars?: Record<string, string> | null }) => {
    const keys = [
      "--accent-hot",
      "--accent-hot-rgb",
      "--accent-hot-glow",
      "--accent-hot-glow-soft",
      "--accent-hot-inset",
      "--accent-hot-status-bg"
    ];

    if (data?.vars) {
      for (const [k, v] of Object.entries(data.vars)) {
        document.documentElement.style.setProperty(k, v);
      }
    } else {
      for (const key of keys) {
        document.documentElement.style.removeProperty(key);
      }
    }
  })
  .catch(() => {});

const app = createApp(App);
app.use(router);
app.mount("#app");
