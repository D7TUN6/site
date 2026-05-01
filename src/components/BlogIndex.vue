<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { BlogPostEntry, Lang } from "@/types/content";

defineProps<{
  lang: Lang;
  posts: BlogPostEntry[];
}>();
</script>

<template>
  <section class="blog-index">
    <h1>{{ lang === "ru" ? "блог" : "blog" }}</h1>

    <p class="blog-index-intro">
      {{
        lang === "ru"
          ? "заметки, процессы, релизы и все промежуточные штуки между музыкой и кодом."
          : "notes, process logs, releases, and everything between music and code."
      }}
    </p>

    <div v-if="posts.length > 0" class="blog-grid">
      <RouterLink v-for="post in posts" :key="post.slug" :to="`/${lang}/blog/${post.slug}`" class="blog-card">
        <div class="blog-card-date">{{ post.publishedAt }}</div>
        <h2>{{ post.title }}</h2>
        <p>{{ post.excerpt }}</p>
      </RouterLink>
    </div>

    <p v-else class="blog-empty">{{ lang === "ru" ? "постов пока нет." : "no posts yet." }}</p>
  </section>
</template>
