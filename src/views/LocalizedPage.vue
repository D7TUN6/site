<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import MarkdownContent from "@/components/MarkdownContent.vue";
import MusicGrid from "@/components/MusicGrid.vue";
import ReleasePlayer from "@/components/ReleasePlayer.vue";
import SiteFrame from "@/components/SiteFrame.vue";
import { getRoutePayload, resolveRoute, splitSplat, type RoutePayload } from "@/lib/content";
import { getLocaleDictionary } from "@/lib/i18n";
import type { Lang, LocaleDictionary, RouteKey } from "@/types/content";

const route = useRoute();
const router = useRouter();

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

const routeKey = computed<RouteKey | null>(() => {
  return resolveRoute(splitSplat(splat.value));
});

const state = reactive({
  status: "loading" as "loading" | "ready" | "not-found" | "error",
  dictionary: null as LocaleDictionary | null,
  payload: null as RoutePayload | null,
  route: null as RouteKey | null,
  message: "",
  showNotes: false
});

type IdleAwareWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

let notesRenderHandle: number | null = null;

function clearNotesRenderSchedule() {
  if (notesRenderHandle === null) return;

  const idleWindow = window as IdleAwareWindow;
  if (typeof idleWindow.cancelIdleCallback === "function") {
    idleWindow.cancelIdleCallback(notesRenderHandle);
  } else {
    window.clearTimeout(notesRenderHandle);
  }

  notesRenderHandle = null;
}

function scheduleNotesRender(enabled: boolean) {
  clearNotesRenderSchedule();
  state.showNotes = false;

  if (!enabled) return;

  const reveal = () => {
    notesRenderHandle = null;
    state.showNotes = true;
  };

  const idleWindow = window as IdleAwareWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    notesRenderHandle = idleWindow.requestIdleCallback(reveal, { timeout: 1200 });
    return;
  }

  notesRenderHandle = window.setTimeout(reveal, 64);
}

const notesMarkdown = computed(() => {
  if (state.status !== "ready" || !state.payload || state.payload?.kind !== "release") return "";

  const title = lang.value === "ru" ? "Заметки" : "Notes";
  const noNotes = lang.value === "ru" ? "Заметки не найдены." : "Notes not found.";
  const notesText = state.payload.release.notes.trim();

  if (!notesText) {
    return `## ${title}\n\n${noNotes}`;
  }

  return `## ${title}\n\n\`\`\`text\n${notesText}\n\`\`\``;
});

const backLabel = computed(() => (lang.value === "ru" ? "Назад к дискографии" : "Back to Discography"));

watch(
  () => [lang.value, routeKey.value] as const,
  async ([nextLang, nextRoute]) => {
    if (!nextLang) {
      await router.replace("/en");
      return;
    }

    state.status = "loading";
    state.dictionary = null;
    state.payload = null;
    state.route = null;
    state.message = "";
    state.showNotes = false;

    try {
      const [dictionary, payload] = await Promise.all([
        getLocaleDictionary(nextLang),
        nextRoute ? getRoutePayload(nextLang, nextRoute) : Promise.resolve(null)
      ]);

      if (!nextRoute) {
        state.status = "not-found";
        state.dictionary = dictionary;
        return;
      }

      if (!payload) {
        state.status = "not-found";
        state.dictionary = dictionary;
        return;
      }

      state.status = "ready";
      state.dictionary = dictionary;
      state.payload = payload;
      state.route = nextRoute;
      scheduleNotesRender(payload.kind === "release");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected loading error";

      try {
        const dictionary = await getLocaleDictionary(nextLang);
        state.status = "error";
        state.dictionary = dictionary;
        state.message = message;
      } catch {
        state.status = "error";
        state.dictionary = null;
        state.message = message;
      }
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearNotesRenderSchedule();
});
</script>

<template>
  <main v-if="state.status === 'loading'" class="loader-screen" aria-live="polite">
    <div class="loader">
      <div class="spinner" />
      <p>Loading...</p>
    </div>
  </main>

  <SiteFrame
    v-else-if="state.status === 'ready' && lang && state.dictionary && state.payload && state.route"
    :lang="lang"
    :route="state.route"
    :dictionary="state.dictionary"
  >
    <MarkdownContent v-if="state.payload.kind === 'markdown'" :source="state.payload.source" />

    <MusicGrid v-else-if="state.payload.kind === 'music-index'" :lang="lang" :releases="state.payload.releases" />

    <template v-else-if="state.payload.kind === 'release'">
      <RouterLink :to="`/${lang}/music`">← {{ backLabel }}</RouterLink>
      <h1>{{ state.payload.release.albumName }}</h1>

      <ReleasePlayer :lang="lang" :release="state.payload.release" />

      <div v-if="state.showNotes" class="release-notes">
        <MarkdownContent :source="notesMarkdown" />
      </div>
    </template>
  </SiteFrame>

  <SiteFrame v-else-if="lang && state.dictionary" :lang="lang" route="main" :dictionary="state.dictionary">
    <template v-if="state.status === 'not-found'">
      <h1>404</h1>
      <p>Page not found.</p>
    </template>

    <template v-else>
      <h1>Error</h1>
      <p>{{ state.status === 'error' ? state.message : 'Unexpected error.' }}</p>
    </template>
  </SiteFrame>

  <main v-else class="loader-screen" aria-live="polite">
    <div class="loader">
      <div class="spinner" />
      <p>Loading failed.</p>
    </div>
  </main>
</template>
