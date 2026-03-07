<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import LanguageToggle from "@/components/LanguageToggle.vue";
import NowPlayingBar from "@/components/NowPlayingBar.vue";
import type { BaseRoute, Lang, LocaleDictionary, RouteKey } from "@/types/content";

const props = defineProps<{
  lang: Lang;
  route: RouteKey;
  dictionary: LocaleDictionary;
}>();

const navItems: Array<{ id: BaseRoute; key: keyof LocaleDictionary["nav"] }> = [
  { id: "main", key: "main" },
  { id: "bio", key: "bio" },
  { id: "music", key: "music" },
  { id: "news", key: "news" },
  { id: "blog", key: "blog" },
  { id: "links", key: "links" }
];

function routeToHref(lang: Lang, route: RouteKey): string {
  if (route === "main") {
    return `/${lang}`;
  }

  return `/${lang}/${route}`;
}

function switchRouteTarget(route: RouteKey): string {
  if (route === "main") {
    return "";
  }

  return `/${route}`;
}

const isRu = computed(() => props.lang === "ru");
const switchLang = computed<Lang>(() => (isRu.value ? "en" : "ru"));
const switchLabel = computed(() => (isRu.value ? "EN" : "RU"));
const switchHref = computed(() => `/${switchLang.value}${switchRouteTarget(props.route)}`);
const isMusicRoute = computed(() => props.route === "music" || props.route.startsWith("music/"));
const isBlogRoute = computed(() => props.route === "blog" || props.route.startsWith("blog/"));
</script>

<template>
  <div class="controls">
    <LanguageToggle :to="switchHref" :label="switchLabel" :lang-to-save="switchLang" />
  </div>

  <div :class="`container lang-${lang}`">
    <header class="site-header">
      <h1>
        <RouterLink :to="`/${lang}`" class="site-title-link">
          {{ dictionary.site.title }}
        </RouterLink>
      </h1>
    </header>

    <nav class="main-nav" aria-label="Primary">
      <ul>
        <li v-for="item in navItems" :key="item.id">
          <span v-if="item.id === 'music' ? isMusicRoute : item.id === 'blog' ? isBlogRoute : route === item.id" class="nav-active">
            {{ dictionary.nav[item.key] }}
          </span>
          <RouterLink v-else :to="routeToHref(lang, item.id)">{{ dictionary.nav[item.key] }}</RouterLink>
        </li>
      </ul>
    </nav>

    <main class="content">
      <slot />
    </main>
  </div>

  <NowPlayingBar :is-music-route="isMusicRoute" :lang="lang" />
</template>
