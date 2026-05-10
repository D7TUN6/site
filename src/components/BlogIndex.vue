<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { BlogPostEntry, Lang } from "@/types/content";

const props = defineProps<{
  lang: Lang;
  posts: BlogPostEntry[];
  kind?: "blog" | "news";
}>();

const isNews = computed(() => props.kind === "news");
const basePath = computed(() => isNews.value ? "news" : "blog");
const heading = computed(() => {
  if (isNews.value) return props.lang === "ru" ? "новости" : "news";
  return props.lang === "ru" ? "блог" : "blog";
});
const intro = computed(() => {
  if (isNews.value) {
    return props.lang === "ru"
      ? "обновления, анонсы и всё что происходит."
      : "updates, announcements, and what's happening.";
  }
  return props.lang === "ru"
    ? "заметки, процессы, релизы и все промежуточные штуки между музыкой и кодом."
    : "notes, process logs, releases, and everything between music and code.";
});
const emptyText = computed(() =>
  isNews.value
    ? (props.lang === "ru" ? "новостей пока нет." : "no news yet.")
    : (props.lang === "ru" ? "постов пока нет." : "no posts yet.")
);
</script>

<template>
  <section class="blog-index">
    <h1>{{ heading }}</h1>

    <p class="blog-index-intro">{{ intro }}</p>

    <div v-if="posts.length > 0" class="blog-grid">
      <RouterLink v-for="post in posts" :key="post.slug" :to="`/${lang}/${basePath}/${post.slug}`" class="blog-card">
        <div class="blog-card-date">{{ post.publishedAt }}</div>
        <h2>{{ post.title }}</h2>
        <p>{{ post.excerpt }}</p>
      </RouterLink>
    </div>

    <p v-else class="blog-empty">{{ emptyText }}</p>
  </section>
</template>
