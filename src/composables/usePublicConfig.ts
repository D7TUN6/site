import { reactive, watchEffect } from "vue";
import { apiFetchJson } from "@/lib/api";

type PublicConfig = {
  yandexMapsApiKey: string | null;
  yandexSearchEnabled: boolean;
  yookassa: {
    shopId: string | null;
    returnUrl: string | null;
  };
};

const state = reactive({
  status: "idle" as "idle" | "loading" | "ready" | "error",
  config: null as PublicConfig | null,
  message: ""
});

async function loadConfig(): Promise<void> {
  state.status = "loading";
  state.message = "";

  try {
    const payload = await apiFetchJson<{
      yandexMapsApiKey?: string | null;
      yandexSearchEnabled?: boolean;
      yookassa?: { shopId?: string | null; returnUrl?: string | null };
    }>("/api/config");
    state.config = {
      yandexMapsApiKey: typeof payload?.yandexMapsApiKey === "string" ? payload.yandexMapsApiKey : null,
      yandexSearchEnabled: Boolean(payload?.yandexSearchEnabled),
      yookassa: {
        shopId: typeof payload?.yookassa?.shopId === "string" ? payload.yookassa.shopId : null,
        returnUrl: typeof payload?.yookassa?.returnUrl === "string" ? payload.yookassa.returnUrl : null
      }
    };
    state.status = "ready";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load config";
    state.status = "error";
    state.config = null;
    state.message = message;
  }
}

let started = false;

export function usePublicConfig() {
  watchEffect(() => {
    if (started) return;
    started = true;
    void loadConfig();
  });

  return {
    state,
    reload: loadConfig
  };
}
