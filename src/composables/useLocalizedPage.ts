import { computed, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getRoutePayload, resolveRoute, splitSplat, type RoutePayload } from "@/lib/content";
import { getLocaleDictionary } from "@/lib/i18n";
import { resolvePreferredLanguage } from "@/lib/languagePreference";
import type { Lang, LocaleDictionary, RouteKey } from "@/types/content";

export function useLocalizedPage() {
  const route = useRoute();
  const router = useRouter();
  let latestRequestId = 0;

  const lang = computed<Lang | null>(() => {
    const raw = typeof route.params.lang === "string" ? route.params.lang : null;
    if (raw === "en" || raw === "ru") return raw;
    return null;
  });

  const splat = computed(() => {
    const raw = route.params.pathMatch;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw.join("/");
    return "";
  });

  const routeKey = computed<RouteKey | null>(() => resolveRoute(splitSplat(splat.value)));

  const state = reactive({
    status: "loading" as "loading" | "ready" | "not-found" | "error",
    dictionary: null as LocaleDictionary | null,
    payload: null as RoutePayload | null,
    route: null as RouteKey | null,
    message: ""
  });

  watch(
    () => [lang.value, routeKey.value] as const,
    async ([nextLang, nextRoute]) => {
      const requestId = ++latestRequestId;

      if (!nextLang) {
        await router.replace(`/${resolvePreferredLanguage()}`);
        return;
      }

      const shouldShowBlockingLoader = !state.dictionary && !state.payload;
      if (shouldShowBlockingLoader) {
        state.status = "loading";
      }
      state.message = "";

      try {
        const [dictionary, payload] = await Promise.all([
          getLocaleDictionary(nextLang),
          nextRoute ? getRoutePayload(nextLang, nextRoute) : Promise.resolve(null)
        ]);

        if (requestId !== latestRequestId) {
          return;
        }

        if (!nextRoute || !payload) {
          state.status = "not-found";
          state.dictionary = dictionary;
          state.payload = null;
          state.route = null;
          return;
        }

        state.status = "ready";
        state.dictionary = dictionary;
        state.payload = payload;
        state.route = nextRoute;
      } catch (error) {
        if (requestId !== latestRequestId) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unexpected loading error";

        try {
          const dictionary = await getLocaleDictionary(nextLang);
          if (requestId !== latestRequestId) {
            return;
          }
          state.status = "error";
          state.dictionary = dictionary;
          state.payload = null;
          state.route = null;
          state.message = message;
        } catch {
          if (requestId !== latestRequestId) {
            return;
          }
          state.status = "error";
          state.dictionary = null;
          state.payload = null;
          state.route = null;
          state.message = message;
        }
      }
    },
    { immediate: true }
  );

  return {
    lang,
    state
  };
}
