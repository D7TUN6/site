<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { Lang, ProjectEntry } from "@/types/content";

const props = defineProps<{
  lang: Lang;
  projects: ProjectEntry[];
}>();

const title = computed(() => (props.lang === "ru" ? "проекты" : "projects"));
</script>

<template>
  <h1>{{ title }}</h1>

  <div class="projects-grid">
    <RouterLink
      v-for="project in projects"
      :key="project.slug"
      :to="`/${lang}/projects/${project.slug}`"
      class="release-card"
    >
      <img :src="project.icon" :alt="project.title[lang]" class="release-cover" loading="lazy" decoding="async" />
      <span class="release-title">{{ project.title[lang] }}</span>
      <span class="project-card-desc">{{ project.description[lang] }}</span>
    </RouterLink>
  </div>
</template>

