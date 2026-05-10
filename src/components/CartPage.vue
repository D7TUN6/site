<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import PickupPointPicker from "@/components/PickupPointPicker.vue";
import QuantityStepper from "@/components/QuantityStepper.vue";
import UiSelect from "@/components/UiSelect.vue";
import YooKassaWidget from "@/components/YooKassaWidget.vue";
import { useAuth } from "@/composables/useAuth";
import { useCart } from "@/composables/useCart";
import { apiFetchJson } from "@/lib/api";
import { formatShopMoney } from "@/lib/money";
import { getAllShopProducts } from "@/lib/shop";
import type { Lang } from "@/types/content";
import type { PickupPoint } from "@/types/shipping";
import type { ShopMoney, ShopProduct } from "@/types/shop";

const props = defineProps<{
  lang: Lang;
}>();

const cart = useCart();
const auth = useAuth();

const products = computed(() => getAllShopProducts());
const productsBySlug = computed(() => new Map(products.value.map((product) => [product.slug, product] as const)));

type CartLine = {
  slug: string;
  product: ShopProduct | null;
  quantity: number;
  lineTotal: ShopMoney | null;
};

const lines = computed<CartLine[]>(() => {
  return cart.items.value.map((item) => {
    const product = productsBySlug.value.get(item.slug) ?? null;
    const lineTotal = product ? { currency: product.price.currency, value: product.price.value * item.quantity } : null;
    return {
      slug: item.slug,
      product,
      quantity: item.quantity,
      lineTotal
    };
  });
});

const total = computed<ShopMoney>(() => {
  const value = lines.value.reduce((sum, line) => sum + (line.lineTotal?.value ?? 0), 0);
  return { currency: "RUB", value };
});

const title = computed(() => (props.lang === "ru" ? "корзина" : "cart"));
const emptyLabel = computed(() => (props.lang === "ru" ? "Корзина пустая." : "Your cart is empty."));
const shopLabel = computed(() => (props.lang === "ru" ? "в магазин" : "to shop"));
const clearLabel = computed(() => (props.lang === "ru" ? "очистить" : "clear"));
const totalLabel = computed(() => (props.lang === "ru" ? "итого" : "total"));

const deliveryProvider = ref("cdek");
const city = ref("");
const selectedPoint = ref<PickupPoint | null>(null);
const manualPickupPoint = ref("");
const comment = ref("");

const deliveryProviderOptions = computed(() => {
  return [
    { value: "cdek", label: "CDEK" },
    { value: "russian_post", label: props.lang === "ru" ? "Почта РФ" : "Russian Post" },
    { value: "ozon", label: "Ozon" },
    { value: "avito", label: "Avito" },
    { value: "custom", label: props.lang === "ru" ? "другое" : "other" }
  ];
});

const checkoutDisabled = computed(() => {
  if (!auth.state.user) return true;
  if (cart.totalItems.value === 0) return true;
  if (isOrderCreated.value) return true;
  if (deliveryProvider.value === "custom") return !manualPickupPoint.value.trim();
  return !selectedPoint.value;
});
const checkoutLabel = computed(() => (props.lang === "ru" ? "создать заказ" : "create order"));

const createStatus = ref<"idle" | "loading" | "done" | "error">("idle");
const createMessage = ref("");
const createdOrderId = ref<string | null>(null);
const isOrderCreated = computed(() => createStatus.value === "done" && Boolean(createdOrderId.value));

const paymentStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const paymentMessage = ref("");
const confirmationToken = ref<string | null>(null);
const payLabel = computed(() => (props.lang === "ru" ? "оплатить" : "pay"));

async function createOrder() {
  if (checkoutDisabled.value) return;
  createStatus.value = "loading";
  createMessage.value = "";
  createdOrderId.value = null;
  paymentStatus.value = "idle";
  paymentMessage.value = "";
  confirmationToken.value = null;

  const items = cart.items.value.map((item) => ({ slug: item.slug, quantity: item.quantity }));
  const pickupPoint =
    deliveryProvider.value === "custom"
      ? { provider: "custom", address: manualPickupPoint.value.trim() }
      : selectedPoint.value;

  try {
    const payload = await apiFetchJson<{
      ok: boolean;
      order: { id: string; status: string; total: { currency: string; value: string }; currency: string };
    }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        shippingProvider: deliveryProvider.value,
        pickupPoint,
        comment: comment.value,
        items
      })
    });

    createdOrderId.value = payload.order?.id || null;
    createStatus.value = "done";
  } catch (error) {
    createStatus.value = "error";
    createMessage.value = error instanceof Error ? error.message : "Unable to create order";
  }
}

function resetCheckout() {
  createStatus.value = "idle";
  createMessage.value = "";
  createdOrderId.value = null;
  paymentStatus.value = "idle";
  paymentMessage.value = "";
  confirmationToken.value = null;
}

function buildReturnUrl(orderId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/${props.lang}/account?order=${encodeURIComponent(orderId)}`;
}

async function startPayment() {
  if (!createdOrderId.value) return;
  paymentStatus.value = "loading";
  paymentMessage.value = "";
  confirmationToken.value = null;

  try {
    const payload = await apiFetchJson<{
      ok: boolean;
      confirmationToken: string;
      orderId: string;
      paymentId: string;
      status: string;
      amount: { currency: string; value: string };
    }>("/api/payments/yookassa/create", {
      method: "POST",
      body: JSON.stringify({ orderId: createdOrderId.value })
    });

    confirmationToken.value = payload.confirmationToken || null;
    if (!confirmationToken.value) {
      throw new Error("Missing confirmation token");
    }
    paymentStatus.value = "ready";
  } catch (error) {
    paymentStatus.value = "error";
    paymentMessage.value = error instanceof Error ? error.message : "Unable to start payment";
  }
}

function onPaymentSuccess() {
  cart.clear();
}

function onPaymentError(message: string) {
  paymentStatus.value = "error";
  paymentMessage.value = message;
}
</script>

<template>
  <h1>{{ title }}</h1>

  <p v-if="cart.totalItems.value === 0" class="cart-empty">
    {{ emptyLabel }}
    <RouterLink :to="`/${lang}/shop`" class="content-link-plain">→ {{ shopLabel }}</RouterLink>
  </p>

  <div v-else class="cart">
    <div class="cart-lines">
      <div v-for="line in lines" :key="line.slug" class="cart-line">
        <RouterLink v-if="line.product" :to="`/${lang}/shop/${line.product.slug}`" class="cart-line-cover-link">
          <img
            :src="(line.product.coverPreviewUrl || line.product.coverUrl) ?? ''"
            :alt="line.product.title"
            class="cart-line-cover"
            width="86"
            height="86"
            loading="lazy"
            decoding="async"
          />
        </RouterLink>

        <div class="cart-line-main">
          <div class="cart-line-title">
            <RouterLink v-if="line.product" :to="`/${lang}/shop/${line.product.slug}`">{{ line.product.title }}</RouterLink>
            <span v-else>{{ line.slug }}</span>
          </div>

          <div class="cart-line-meta">
            <div class="cart-line-price" v-if="line.product">{{ formatShopMoney(line.product.price, lang) }}</div>
            <div class="cart-line-qty">
              <QuantityStepper
                :model-value="line.quantity"
                :min="1"
                :disabled="isOrderCreated"
                @update:model-value="(value) => cart.setQuantity(line.slug, value)"
              />
              <button type="button" class="cart-remove" :disabled="isOrderCreated" @click="cart.setQuantity(line.slug, 0)">
                {{ lang === "ru" ? "удалить" : "remove" }}
              </button>
            </div>
          </div>
        </div>

        <div class="cart-line-total" v-if="line.lineTotal">{{ formatShopMoney(line.lineTotal, lang) }}</div>
      </div>
    </div>

    <div class="cart-summary">
      <div class="cart-total">
        <div class="cart-total-label">{{ totalLabel }}</div>
        <div class="cart-total-value">{{ formatShopMoney(total, lang) }}</div>
      </div>

      <button type="button" class="shop-btn shop-btn-secondary" :disabled="isOrderCreated" @click="cart.clear">{{ clearLabel }}</button>
    </div>

    <section class="checkout">
      <h2 class="checkout-title">{{ lang === "ru" ? "оформление" : "checkout" }}</h2>

      <p v-if="!auth.state.user" class="checkout-hint">
        {{
          lang === "ru"
            ? "Чтобы оформить заказ, войдите в личный кабинет."
            : "Please sign in to place an order."
        }}
        <RouterLink :to="`/${lang}/account`">{{ lang === "ru" ? "перейти" : "go" }}</RouterLink>
      </p>

      <div class="checkout-grid">
        <label class="form-field">
          <span class="form-label">{{ lang === "ru" ? "служба доставки" : "delivery provider" }}</span>
          <UiSelect
            v-model="deliveryProvider"
            :options="deliveryProviderOptions"
            :aria-label="lang === 'ru' ? 'служба доставки' : 'delivery provider'"
          />
        </label>

        <label class="form-field">
          <span class="form-label">{{ lang === "ru" ? "город" : "city" }}</span>
          <input v-model="city" class="form-input" :placeholder="lang === 'ru' ? 'Например: Екатеринбург' : 'e.g. Yekaterinburg'" />
        </label>

        <label class="form-field form-field-full">
          <span class="form-label">{{ lang === "ru" ? "пункт выдачи" : "pickup point" }}</span>
          <div v-if="deliveryProvider === 'custom'" class="checkout-custom-point">
            <input
              v-model="manualPickupPoint"
              class="form-input"
              :placeholder="lang === 'ru' ? 'Адрес / описание пункта выдачи' : 'Pickup point address / description'"
            />
          </div>

          <PickupPointPicker
            v-else
            v-model="selectedPoint"
            :lang="lang"
            :provider="deliveryProvider"
            :city="city"
          />
        </label>

        <label class="form-field form-field-full">
          <span class="form-label">{{ lang === "ru" ? "комментарий" : "comment" }}</span>
          <textarea
            v-model="comment"
            class="form-textarea"
            :placeholder="lang === 'ru' ? 'Например: позвонить перед доставкой' : 'e.g. call before delivery'"
            rows="3"
          />
        </label>
      </div>

      <div class="checkout-actions">
        <button type="button" class="shop-btn" :disabled="checkoutDisabled || createStatus === 'loading'" @click="createOrder">
          {{ checkoutLabel }}
        </button>

        <p v-if="createStatus === 'error'" class="checkout-hint">{{ createMessage }}</p>
        <p v-else-if="createStatus === 'done' && createdOrderId" class="checkout-hint">
          {{ lang === "ru" ? "Заказ создан:" : "Order created:" }} <span class="mono">{{ createdOrderId }}</span>
        </p>
        <p v-if="isOrderCreated" class="checkout-hint">
          {{
            lang === "ru"
              ? "Корзина зафиксирована для этого заказа. Чтобы изменить товары — сбросьте оформление."
              : "Cart is locked for this order. Reset checkout to change items."
          }}
          <button type="button" class="content-link-plain" @click="resetCheckout">
            {{ lang === "ru" ? "сбросить" : "reset" }}
          </button>
        </p>

        <div v-if="createStatus === 'done' && createdOrderId" class="payment">
          <button type="button" class="shop-btn" :disabled="paymentStatus === 'loading'" @click="startPayment">
            {{ payLabel }}
          </button>

          <p v-if="paymentStatus === 'error'" class="checkout-hint">{{ paymentMessage }}</p>

          <YooKassaWidget
            v-else-if="paymentStatus === 'ready' && confirmationToken"
            :confirmation-token="confirmationToken"
            :return-url="buildReturnUrl(createdOrderId)"
            @success="onPaymentSuccess"
            @error="onPaymentError"
          />
        </div>
      </div>
    </section>
  </div>
</template>
