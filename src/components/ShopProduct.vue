<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import MarkdownContent from "@/components/MarkdownContent.vue";
import QuantityStepper from "@/components/QuantityStepper.vue";
import { useCart } from "@/composables/useCart";
import { formatShopMoney } from "@/lib/money";
import type { Lang } from "@/types/content";
import type { ShopProductDetails } from "@/types/shop";

const props = defineProps<{ lang: Lang; product: ShopProductDetails }>();

const cart = useCart();
const qty = ref(1);
watch(() => props.product.slug, () => { qty.value = 1; });

const isAvailable = computed(() => props.product.status === "available");
const isSoldOut = computed(() => props.product.status === "sold_out");
const isComingSoon = computed(() => props.product.status === "coming_soon");

const statusLabel = computed(() => {
  if (isSoldOut.value) return props.lang === "ru" ? "распродано" : "sold out";
  if (isComingSoon.value) return props.lang === "ru" ? "скоро в продаже" : "coming soon";
  return "";
});

function addToCart() {
  if (!isAvailable.value) return;
  cart.increment(props.product.slug, qty.value);
}

// Gallery
const images = computed(() => {
  if (props.product.images?.length) return props.product.images;
  if (props.product.coverUrl) return [props.product.coverUrl];
  return [];
});

const activeIndex = ref(0);
watch(() => props.product.slug, () => { activeIndex.value = 0; });

function prev() { activeIndex.value = (activeIndex.value - 1 + images.value.length) % images.value.length; }
function next() { activeIndex.value = (activeIndex.value + 1) % images.value.length; }

// Lightbox
const lightboxOpen = ref(false);
const lightboxIndex = ref(0);

function openLightbox(i: number) { lightboxIndex.value = i; lightboxOpen.value = true; }
function closeLightbox() { lightboxOpen.value = false; }
function lbPrev() { lightboxIndex.value = (lightboxIndex.value - 1 + images.value.length) % images.value.length; }
function lbNext() { lightboxIndex.value = (lightboxIndex.value + 1) % images.value.length; }
function onLbKey(e: KeyboardEvent) {
  if (e.key === "ArrowLeft") lbPrev();
  else if (e.key === "ArrowRight") lbNext();
  else if (e.key === "Escape") closeLightbox();
}
</script>

<template>
  <RouterLink :to="`/${lang}/shop`" class="content-link-plain">← {{ lang === "ru" ? "назад в магазин" : "back to shop" }}</RouterLink>

  <div class="shop-product">
    <!-- Gallery -->
    <div class="shop-gallery">
      <div class="shop-gallery-main" role="button" tabindex="0" @click="openLightbox(activeIndex)" @keydown.enter="openLightbox(activeIndex)">
        <img v-if="images.length" :src="images[activeIndex]" :alt="product.title" class="shop-gallery-img" loading="eager" decoding="async" />
        <div v-else class="shop-gallery-img shop-gallery-empty" />
        <span v-if="!isAvailable" :class="['shop-status-badge', `shop-status-${product.status}`, 'shop-gallery-status']">{{ statusLabel }}</span>
        <span v-if="images.length > 1" class="shop-gallery-zoom" aria-hidden="true">⤢</span>
      </div>

      <div v-if="images.length > 1" class="shop-gallery-thumbs">
        <button
          v-for="(img, i) in images"
          :key="i"
          type="button"
          :class="['shop-gallery-thumb-btn', { 'is-active': i === activeIndex }]"
          @click="activeIndex = i"
        >
          <img :src="img" :alt="`${product.title} ${i + 1}`" class="shop-gallery-thumb" loading="lazy" decoding="async" />
        </button>
      </div>

      <div v-if="images.length > 1" class="shop-gallery-nav">
        <button type="button" class="shop-gallery-arrow" aria-label="prev" @click="prev">‹</button>
        <span class="shop-gallery-counter">{{ activeIndex + 1 }} / {{ images.length }}</span>
        <button type="button" class="shop-gallery-arrow" aria-label="next" @click="next">›</button>
      </div>
    </div>

    <div class="shop-product-main">
      <h1 class="shop-product-title">{{ product.title }}</h1>

      <div class="shop-product-meta">
        <span v-if="product.category" class="shop-badge">{{ product.category }}</span>
        <span v-if="!isAvailable" :class="['shop-status-badge', `shop-status-${product.status}`]">{{ statusLabel }}</span>
      </div>

      <div class="shop-product-price">{{ formatShopMoney(product.price, lang) }}</div>

      <div v-if="isAvailable && product.quantity > 0" class="shop-product-qty-hint">
        {{ lang === "ru" ? `в наличии: ${product.quantity} шт.` : `in stock: ${product.quantity}` }}
      </div>

      <div class="shop-product-actions">
        <template v-if="isAvailable">
          <QuantityStepper v-model="qty" :min="1" :max="product.quantity > 0 ? product.quantity : null" />
          <button type="button" class="shop-btn" @click="addToCart">{{ lang === "ru" ? "в корзину" : "add to cart" }}</button>
        </template>
        <button v-else type="button" class="shop-btn" disabled>{{ statusLabel }}</button>
        <RouterLink :to="`/${lang}/cart`" class="shop-btn shop-btn-secondary">
          {{ lang === "ru" ? "корзина" : "cart" }} ({{ cart.totalItems }})
        </RouterLink>
      </div>
    </div>
  </div>

  <div class="shop-product-description">
    <MarkdownContent :source="product.descriptionMarkdown" />
  </div>

  <!-- Fullscreen lightbox -->
  <Teleport to="body">
    <div
      v-if="lightboxOpen"
      class="shop-lightbox"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      @click.self="closeLightbox"
      @keydown="onLbKey"
    >
      <button type="button" class="shop-lightbox-close" aria-label="close" @click="closeLightbox">✕</button>
      <button v-if="images.length > 1" type="button" class="shop-lightbox-arrow shop-lightbox-prev" aria-label="prev" @click="lbPrev">‹</button>
      <img :src="images[lightboxIndex]" :alt="product.title" class="shop-lightbox-img" />
      <button v-if="images.length > 1" type="button" class="shop-lightbox-arrow shop-lightbox-next" aria-label="next" @click="lbNext">›</button>
      <div v-if="images.length > 1" class="shop-lightbox-counter">{{ lightboxIndex + 1 }} / {{ images.length }}</div>
    </div>
  </Teleport>
</template>
