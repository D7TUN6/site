<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { getMusicTagLabel, groupMusicReleasesByTag } from "@/lib/music";
import type { Lang, ReleaseEntry } from "@/types/content";

const props = defineProps<{
  lang: Lang;
  releases: ReleaseEntry[];
}>();

const releaseGroups = computed(() =>
  groupMusicReleasesByTag(props.releases)
    .filter((group) => group.releases.length > 0)
    .map((group) => ({
      ...group,
      label: `${getMusicTagLabel(group.tag)}${group.releases.length > 1 ? "s" : ""}`
    }))
);
</script>

<template>
  <h1>{{ lang === "ru" ? "музыка" : "music" }}</h1>

  <div class="music-sections">
    <section v-for="group in releaseGroups" :key="group.tag" class="music-section">
      <h2 class="music-section-title">{{ group.label }}</h2>

      <div class="music-grid">
        <RouterLink
          v-for="release in group.releases"
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
    </section>
  </div>
</template>
