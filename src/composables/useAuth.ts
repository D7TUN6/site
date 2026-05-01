import { computed, reactive } from "vue";
import { apiFetchJson, ApiError } from "@/lib/api";
import type { Lang } from "@/types/content";

export type AuthUser = {
  id: number;
  email: string;
  emailVerified: boolean;
};

const state = reactive({
  status: "idle" as "idle" | "loading" | "ready" | "error",
  user: null as AuthUser | null,
  message: ""
});

let mePromise: Promise<void> | null = null;
let started = false;

async function loadMe(): Promise<void> {
  state.status = "loading";
  state.message = "";

  try {
    const payload = await apiFetchJson<{ user: AuthUser | null }>("/api/auth/me", { method: "GET" });
    state.user = payload.user ?? null;
    state.status = "ready";
  } catch (error) {
    state.status = "error";
    state.user = null;
    state.message = error instanceof Error ? error.message : "Unable to load session";
  }
}

export function useAuth() {
  if (!started) {
    started = true;
    if (!mePromise) {
      mePromise = loadMe().finally(() => {
        mePromise = null;
      });
    }
  }

  const isLoggedIn = computed(() => Boolean(state.user));

  async function register({ email, password, lang }: { email: string; password: string; lang: Lang }) {
    const payload = await apiFetchJson<{ ok: boolean; user: AuthUser | null }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, lang })
    });
    state.user = payload.user ?? null;
    state.status = "ready";
  }

  async function verify({ email, code, lang }: { email: string; code: string; lang: Lang }) {
    const payload = await apiFetchJson<{ ok: boolean; user: AuthUser | null }>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email, code, lang })
    });
    state.user = payload.user ?? null;
    state.status = "ready";
  }

  async function resend({ email, lang }: { email: string; lang: Lang }) {
    await apiFetchJson<{ ok: boolean }>("/api/auth/resend", {
      method: "POST",
      body: JSON.stringify({ email, lang })
    });
  }

  async function login({ email, password, lang }: { email: string; password: string; lang: Lang }) {
    const payload = await apiFetchJson<{ ok: boolean; user: AuthUser | null }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, lang })
    });
    state.user = payload.user ?? null;
    state.status = "ready";
  }

  async function logout() {
    try {
      await apiFetchJson<{ ok: boolean }>("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
    } finally {
      state.user = null;
      state.status = "ready";
    }
  }

  async function refresh() {
    await loadMe();
  }

  return {
    state,
    isLoggedIn,
    register,
    verify,
    resend,
    login,
    logout,
    refresh
  };
}
