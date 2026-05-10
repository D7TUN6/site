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
  } catch {
    // Ignore storage errors; still attempt a reload below.
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

installChunkLoadAutoReload();

const app = createApp(App);
app.use(router);
app.mount("#app");
