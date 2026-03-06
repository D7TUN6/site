<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { Lang, ReleaseEntry } from "@/types/content";

defineProps<{
  lang: Lang;
  releases: ReleaseEntry[];
}>();
</script>

<template>
  <h1>{{ lang === "ru" ? "музыка" : "music" }}</h1>

  <div class="music-grid">
    <RouterLink
      v-for="release in releases"
      :key="release.slug"
      :to="`/${lang}/music/${release.slug}`"
      class="release-card"
    >
      <img
        :src="release.coverPreviewUrl || release.coverUrl"
        :alt="release.albumName"
        class="release-cover"
        loading="lazy"
        decoding="async"
      />
      <span class="release-title">{{ release.albumName }}</span>
    </RouterLink>
  </div>
</template>
