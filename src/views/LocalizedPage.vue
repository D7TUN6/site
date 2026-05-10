<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AccountPage from "@/components/AccountPage.vue";
import AdminPage from "@/components/AdminPage.vue";
import BlogIndex from "@/components/BlogIndex.vue";
import CartPage from "@/components/CartPage.vue";
import MarkdownContent from "@/components/MarkdownContent.vue";
import MusicGrid from "@/components/MusicGrid.vue";
import OssMigrationWizard from "@/components/OssMigrationWizard.vue";
import ProjectsIndex from "@/components/ProjectsIndex.vue";
import ReleasePlayer from "@/components/ReleasePlayer.vue";
import ShopIndex from "@/components/ShopIndex.vue";
import ShopProduct from "@/components/ShopProduct.vue";
import SiteFrame from "@/components/SiteFrame.vue";
import { useLocalizedPage } from "@/composables/useLocalizedPage";

const { lang, state } = useLocalizedPage();

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
const blogBackLabel = computed(() => (lang.value === "ru" ? "Назад в блог" : "Back to Blog"));

const notFoundTitle = computed(() => (lang.value === "ru" ? "404 — страница не найдена" : "404 — page not found"));
const notFoundText = computed(() =>
  lang.value === "ru"
    ? "Похоже, такой страницы нет. Проверьте адрес или перейдите в разделы сайта."
    : "Looks like this page does not exist. Check the URL or use the navigation links below."
);
const errorTitle = computed(() => (lang.value === "ru" ? "ошибка" : "error"));
const errorText = computed(() =>
  lang.value === "ru"
    ? "Что-то пошло не так. Попробуйте обновить страницу."
    : "Something went wrong. Try reloading the page."
);
const homeLabel = computed(() => (lang.value === "ru" ? "на главную" : "home"));
const shopLabel = computed(() => (lang.value === "ru" ? "магазин" : "shop"));
const accountLabel = computed(() => (lang.value === "ru" ? "личный кабинет" : "account"));
const reloadLabel = computed(() => (lang.value === "ru" ? "обновить" : "reload"));

function reloadPage() {
  if (typeof window === "undefined") return;
  window.location.reload();
}
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
    <MarkdownContent
      v-if="state.payload.kind === 'markdown'"
      :source="state.payload.source"
      :open-external-links-in-new-tab="state.route === 'links'"
    />

    <MusicGrid v-else-if="state.payload.kind === 'music-index'" :lang="lang" :releases="state.payload.releases" />

    <BlogIndex v-else-if="state.payload.kind === 'blog-index'" :lang="lang" :posts="state.payload.posts" />

    <BlogIndex v-else-if="state.payload.kind === 'news-index'" :lang="lang" :posts="state.payload.posts" :kind="'news'" />

    <ProjectsIndex v-else-if="state.payload.kind === 'projects-index'" :lang="lang" :projects="state.payload.projects" />

    <OssMigrationWizard v-else-if="state.payload.kind === 'oss-migrator'" :lang="lang" />

    <ShopIndex v-else-if="state.payload.kind === 'shop-index'" :lang="lang" :products="state.payload.products" />

    <ShopProduct v-else-if="state.payload.kind === 'shop-product'" :lang="lang" :product="state.payload.product" />

    <CartPage v-else-if="state.payload.kind === 'cart'" :lang="lang" />

    <AccountPage v-else-if="state.payload.kind === 'account'" :lang="lang" />

    <AdminPage v-else-if="state.payload.kind === 'admin'" :lang="lang" />

    <template v-else-if="state.payload.kind === 'release'">
      <RouterLink :to="`/${lang}/music`" class="content-link-plain">← {{ backLabel }}</RouterLink>
      <h1>{{ state.payload.release.albumName }}</h1>

      <ReleasePlayer :lang="lang" :release="state.payload.release" />

      <div class="release-notes">
        <MarkdownContent :source="notesMarkdown" />
      </div>
    </template>

    <template v-else-if="state.payload.kind === 'blog-post'">
      <RouterLink :to="`/${lang}/blog`" class="content-link-plain">← {{ blogBackLabel }}</RouterLink>
      <article class="blog-post">
        <header class="blog-post-head">
          <div class="blog-post-date">{{ state.payload.post.publishedAt }}</div>
          <h1>{{ state.payload.post.title }}</h1>
          <p v-if="state.payload.post.excerpt" class="blog-post-excerpt">{{ state.payload.post.excerpt }}</p>
        </header>

        <MarkdownContent :source="state.payload.post.content" :allow-html="true" />
      </article>
    </template>

    <template v-else-if="state.payload.kind === 'news-post'">
      <RouterLink :to="`/${lang}/news`" class="content-link-plain">← {{ lang === 'ru' ? 'Назад к новостям' : 'Back to News' }}</RouterLink>
      <article class="blog-post">
        <header class="blog-post-head">
          <div class="blog-post-date">{{ state.payload.post.publishedAt }}</div>
          <h1>{{ state.payload.post.title }}</h1>
          <p v-if="state.payload.post.excerpt" class="blog-post-excerpt">{{ state.payload.post.excerpt }}</p>
        </header>

        <MarkdownContent :source="state.payload.post.content" :allow-html="true" />
      </article>
    </template>
  </SiteFrame>

  <SiteFrame v-else-if="lang && state.dictionary" :lang="lang" route="main" :dictionary="state.dictionary">
    <template v-if="state.status === 'not-found'">
      <div class="error-page">
        <h1 class="error-title">{{ notFoundTitle }}</h1>
        <p class="error-text">{{ notFoundText }}</p>

        <div class="error-actions">
          <RouterLink :to="`/${lang}`" class="shop-btn shop-btn-secondary">{{ homeLabel }}</RouterLink>
          <RouterLink :to="`/${lang}/shop`" class="shop-btn shop-btn-secondary">{{ shopLabel }}</RouterLink>
          <RouterLink :to="`/${lang}/account`" class="shop-btn shop-btn-secondary">{{ accountLabel }}</RouterLink>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="error-page">
        <h1 class="error-title">{{ errorTitle }}</h1>
        <p class="error-text">{{ errorText }}</p>
        <p v-if="state.status === 'error' && state.message" class="error-details">{{ state.message }}</p>

        <div class="error-actions">
          <button type="button" class="shop-btn" @click="reloadPage">{{ reloadLabel }}</button>
          <RouterLink :to="`/${lang}`" class="shop-btn shop-btn-secondary">{{ homeLabel }}</RouterLink>
        </div>
      </div>
    </template>
  </SiteFrame>

  <main v-else class="loader-screen" aria-live="polite">
    <div class="loader">
      <div class="spinner" />
      <p>Loading failed.</p>
    </div>
  </main>
</template>
