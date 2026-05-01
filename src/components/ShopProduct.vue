<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import MarkdownContent from "@/components/MarkdownContent.vue";
import QuantityStepper from "@/components/QuantityStepper.vue";
import { useCart } from "@/composables/useCart";
import { formatShopMoney } from "@/lib/money";
import type { Lang } from "@/types/content";
import type { ShopProductDetails } from "@/types/shop";

const props = defineProps<{
  lang: Lang;
  product: ShopProductDetails;
}>();

const cart = useCart();

const qty = ref(1);
watch(
  () => props.product.slug,
  () => {
    qty.value = 1;
  }
);

const backLabel = computed(() => (props.lang === "ru" ? "назад в магазин" : "back to shop"));
const addLabel = computed(() => (props.lang === "ru" ? "в корзину" : "add to cart"));
const cartLabel = computed(() => (props.lang === "ru" ? "корзина" : "cart"));

function addToCart() {
  cart.increment(props.product.slug, qty.value);
}
</script>

<template>
  <RouterLink :to="`/${lang}/shop`" class="content-link-plain">← {{ backLabel }}</RouterLink>

  <div class="shop-product">
    <img
      :src="product.coverUrl"
      :alt="product.title"
      class="shop-product-cover"
      width="240"
      height="240"
      loading="eager"
      decoding="async"
    />

    <div class="shop-product-main">
      <h1 class="shop-product-title">{{ product.title }}</h1>
      <div class="shop-product-price">{{ formatShopMoney(product.price, lang) }}</div>

      <div class="shop-product-actions">
        <QuantityStepper v-model="qty" :min="1" />
        <button type="button" class="shop-btn" @click="addToCart">{{ addLabel }}</button>
        <RouterLink :to="`/${lang}/cart`" class="shop-btn shop-btn-secondary">
          {{ cartLabel }} ({{ cart.totalItems }})
        </RouterLink>
      </div>
    </div>
  </div>

  <div class="shop-product-description">
    <MarkdownContent :source="product.descriptionMarkdown" />
  </div>
</template>

