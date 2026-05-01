<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import UiSelect from "@/components/UiSelect.vue";
import { useCart } from "@/composables/useCart";
import { formatShopMoney } from "@/lib/money";
import type { Lang } from "@/types/content";
import type { ShopProduct, ShopProductCategory } from "@/types/shop";

const props = defineProps<{
  lang: Lang;
  products: ShopProduct[];
}>();

const cart = useCart();
const title = computed(() => (props.lang === "ru" ? "магазин" : "shop"));
const addLabel = computed(() => (props.lang === "ru" ? "в корзину" : "add to cart"));

function addToCart(slug: string) {
  cart.increment(slug, 1);
}

const query = ref("");
const selectedCategory = ref("all");

const searchLabel = computed(() => (props.lang === "ru" ? "поиск" : "search"));
const categoryLabel = computed(() => (props.lang === "ru" ? "категория" : "category"));
const allLabel = computed(() => (props.lang === "ru" ? "все" : "all"));

function categoryTitle(category: ShopProductCategory): string {
  switch (category) {
    case "cd":
      return "CD";
    default:
      return category;
  }
}

function normalizeQuery(value: string): string {
  return String(value || "").trim().toLowerCase();
}

const filteredProducts = computed(() => {
  const q = normalizeQuery(query.value);
  return props.products.filter((product) => {
    if (selectedCategory.value !== "all" && product.category !== selectedCategory.value) {
      return false;
    }

    if (!q) return true;
    const haystack = `${product.title} ${product.slug} ${product.category}`.toLowerCase();
    return haystack.includes(q);
  });
});

const categories = computed<ShopProductCategory[]>(() => {
  const set = new Set<ShopProductCategory>();
  for (const product of props.products) {
    if (product?.category) set.add(product.category);
  }
  return Array.from(set);
});

const categoryOptions = computed(() => {
  return [
    { value: "all", label: allLabel.value },
    ...categories.value.map((category) => ({ value: category, label: categoryTitle(category) }))
  ];
});
</script>

<template>
  <h1>{{ title }}</h1>

  <div class="shop-filters">
    <label class="form-field shop-filter">
      <span class="form-label">{{ searchLabel }}</span>
      <input v-model="query" class="form-input" :placeholder="lang === 'ru' ? 'например: cd' : 'e.g. cd'" />
    </label>

    <label class="form-field shop-filter">
      <span class="form-label">{{ categoryLabel }}</span>
      <UiSelect v-model="selectedCategory" :options="categoryOptions" :aria-label="categoryLabel" />
    </label>
  </div>

  <div class="shop-grid">
    <div v-for="product in filteredProducts" :key="product.slug" class="shop-card">
      <RouterLink :to="`/${lang}/shop/${product.slug}`" class="shop-card-link">
        <img
          :src="product.coverPreviewUrl || product.coverUrl"
          :alt="product.title"
          class="shop-cover"
          width="180"
          loading="lazy"
          decoding="async"
        />
        <div class="shop-card-meta">
          <span class="shop-title">
            {{ product.title }}
            <span class="shop-badge">{{ categoryTitle(product.category) }}</span>
          </span>
          <span class="shop-price">{{ formatShopMoney(product.price, lang) }}</span>
        </div>
      </RouterLink>

      <button type="button" class="shop-btn" @click="addToCart(product.slug)">{{ addLabel }}</button>
    </div>
  </div>

  <p v-if="filteredProducts.length === 0" class="shop-empty">
    {{ lang === "ru" ? "Ничего не найдено." : "No results." }}
  </p>
</template>
