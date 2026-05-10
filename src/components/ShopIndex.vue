<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import UiSelect from "@/components/UiSelect.vue";
import { useCart } from "@/composables/useCart";
import { formatShopMoney } from "@/lib/money";
import type { Lang } from "@/types/content";
import type { ShopProduct } from "@/types/shop";

const props = defineProps<{
  lang: Lang;
  products: ShopProduct[];
}>();

const cart = useCart();
const title = computed(() => (props.lang === "ru" ? "магазин" : "shop"));
const addLabel = computed(() => (props.lang === "ru" ? "в корзину" : "add to cart"));

function addToCart(product: ShopProduct) {
  if (product.status !== "available") return;
  cart.increment(product.slug, 1);
}

const query = ref("");
const selectedCategory = ref("all");

const searchLabel = computed(() => (props.lang === "ru" ? "поиск" : "search"));
const categoryLabel = computed(() => (props.lang === "ru" ? "категория" : "category"));
const allLabel = computed(() => (props.lang === "ru" ? "все" : "all"));

function normalizeQuery(value: string): string {
  return String(value || "").trim().toLowerCase();
}

const filteredProducts = computed(() => {
  const q = normalizeQuery(query.value);
  return props.products.filter((product) => {
    if (selectedCategory.value !== "all" && product.category !== selectedCategory.value) return false;
    if (!q) return true;
    return `${product.title} ${product.slug} ${product.category}`.toLowerCase().includes(q);
  });
});

const categories = computed<string[]>(() => {
  const set = new Set<string>();
  for (const p of props.products) { if (p?.category) set.add(p.category); }
  return Array.from(set);
});

const categoryOptions = computed(() => [
  { value: "all", label: allLabel.value },
  ...categories.value.map((c) => ({ value: c, label: c.toUpperCase() }))
]);

function statusLabel(product: ShopProduct): string {
  if (product.status === "sold_out") return props.lang === "ru" ? "распродано" : "sold out";
  if (product.status === "coming_soon") return props.lang === "ru" ? "скоро" : "coming soon";
  return "";
}
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
        <div class="shop-cover-wrap">
          <img
            v-if="product.coverPreviewUrl || product.coverUrl"
            :src="(product.coverPreviewUrl || product.coverUrl) ?? ''"
            :alt="product.title"
            class="shop-cover"
            width="180"
            loading="lazy"
            decoding="async"
          />
          <div v-else class="shop-cover shop-cover-empty" />
          <span v-if="product.status !== 'available'" :class="['shop-status-badge', `shop-status-${product.status}`, 'shop-card-status']">
            {{ statusLabel(product) }}
          </span>
        </div>
        <div class="shop-card-meta">
          <span class="shop-title">
            {{ product.title }}
            <span v-if="product.category" class="shop-badge">{{ product.category }}</span>
          </span>
          <span class="shop-price">{{ formatShopMoney(product.price, lang) }}</span>
        </div>
      </RouterLink>

      <button
        type="button"
        class="shop-btn"
        :disabled="product.status !== 'available'"
        @click="addToCart(product)"
      >
        {{ product.status === "available" ? addLabel : statusLabel(product) }}
      </button>
    </div>
  </div>

  <p v-if="filteredProducts.length === 0" class="shop-empty">
    {{ lang === "ru" ? "Ничего не найдено." : "No results." }}
  </p>
</template>
