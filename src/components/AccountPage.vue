<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";
import { apiFetchJson } from "@/lib/api";
import type { Lang } from "@/types/content";

const props = defineProps<{
  lang: Lang;
}>();

const auth = useAuth();
const route = useRoute();
const router = useRouter();

const title = computed(() => (props.lang === "ru" ? "личный кабинет" : "account"));
const loginTitle = computed(() => (props.lang === "ru" ? "вход" : "login"));
const registerTitle = computed(() => (props.lang === "ru" ? "регистрация" : "register"));
const logoutLabel = computed(() => (props.lang === "ru" ? "выйти" : "logout"));
const adminHref = computed(() => `/${props.lang}/admin`);

const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const status = ref<"idle" | "loading" | "error">("idle");
const message = ref("");
const isLoading = computed(() => status.value === "loading");

async function onRegister() {
  status.value = "loading";
  message.value = "";
  try {
    await auth.register({ email: email.value, password: password.value, lang: props.lang });
    status.value = "idle";
    await loadOrders();
  } catch (error) {
    status.value = "error";
    message.value = error instanceof Error ? error.message : "Unable to register";
  }
}

async function onLogin() {
  status.value = "loading";
  message.value = "";
  try {
    await auth.login({ email: email.value, password: password.value, lang: props.lang });
    status.value = "idle";
    await loadOrders();
  } catch (error) {
    status.value = "error";
    message.value = error instanceof Error ? error.message : "Unable to login";
  }
}

async function onLogout() {
  await auth.logout();
  orders.value = [];
  selectedOrder.value = null;
  selectedOrderId.value = null;
  await router.replace({ query: {} });
}

type OrderSummary = {
  id: string;
  status: string;
  total: { currency: string; value: string };
  shippingProvider: string;
  pickupPoint: unknown;
  shippingEta: string | null;
  tracking: { number: string | null; status: string | null };
  createdAt: number;
  updatedAt: number;
};

const orders = ref<OrderSummary[]>([]);
const ordersStatus = ref<"idle" | "loading" | "error">("idle");
const ordersMessage = ref("");

async function loadOrders() {
  if (!auth.state.user) return;
  ordersStatus.value = "loading";
  ordersMessage.value = "";
  try {
    const payload = await apiFetchJson<{ ok: boolean; orders: OrderSummary[] }>("/api/orders/mine", { method: "GET" });
    orders.value = Array.isArray(payload.orders) ? payload.orders : [];
    ordersStatus.value = "idle";
  } catch (error) {
    ordersStatus.value = "error";
    ordersMessage.value = error instanceof Error ? error.message : "Unable to load orders";
  }
}

const selectedOrderId = ref<string | null>(typeof route.query.order === "string" ? route.query.order : null);
watch(
  () => route.query.order,
  (value) => {
    selectedOrderId.value = typeof value === "string" ? value : null;
  }
);

type OrderDetails = {
  id: string;
  status: string;
  email: string;
  total: { currency: string; value: string };
  shippingProvider: string;
  pickupPoint: unknown;
  comment: string;
  payment: {
    provider: string | null;
    id: string | null;
    status: string | null;
    amount: { currency: string; value: string } | null;
    paidAt: number | null;
  };
  shippingEta: string | null;
  tracking: { number: string | null; status: string | null };
  createdAt: number;
  updatedAt: number;
};

type OrderItem = {
  slug: string;
  title: string;
  unitPrice: { currency: string; value: string };
  quantity: number;
};

type OrderEvent = {
  id: number;
  kind: string;
  message: string;
  data: unknown;
  createdAt: number;
};

const selectedOrder = ref<OrderDetails | null>(null);
const selectedItems = ref<OrderItem[]>([]);
const selectedEvents = ref<OrderEvent[]>([]);
const orderDetailsStatus = ref<"idle" | "loading" | "error">("idle");
const orderDetailsMessage = ref("");

async function loadOrderDetails(orderId: string) {
  orderDetailsStatus.value = "loading";
  orderDetailsMessage.value = "";
  try {
    const payload = await apiFetchJson<{ ok: boolean; order: OrderDetails; items: OrderItem[]; events: OrderEvent[] }>(
      `/api/orders/${encodeURIComponent(orderId)}`,
      { method: "GET" }
    );
    selectedOrder.value = payload.order ?? null;
    selectedItems.value = Array.isArray(payload.items) ? payload.items : [];
    selectedEvents.value = Array.isArray(payload.events) ? payload.events : [];
    orderDetailsStatus.value = "idle";
  } catch (error) {
    orderDetailsStatus.value = "error";
    orderDetailsMessage.value = error instanceof Error ? error.message : "Unable to load order";
  }
}

watch(
  () => [auth.state.user?.id, selectedOrderId.value] as const,
  async ([, orderId]) => {
    if (!auth.state.user || !orderId) {
      selectedOrder.value = null;
      return;
    }
    await loadOrderDetails(orderId);
  },
  { immediate: true }
);

function selectOrder(orderId: string) {
  void router.replace({ query: { ...route.query, order: orderId } });
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(props.lang === "ru" ? "ru-RU" : "en-US");
  } catch {
    return String(ms);
  }
}

function formatMoney(money: unknown): string {
  if (!money || typeof money !== "object") return "";
  const value = "value" in money && typeof (money as { value?: unknown }).value === "string" ? String((money as { value?: unknown }).value) : "";
  const currency =
    "currency" in money && typeof (money as { currency?: unknown }).currency === "string" ? String((money as { currency?: unknown }).currency) : "";
  if (!value) return "";
  if (currency === "RUB") return `${value} ₽`;
  return `${value} ${currency}`;
}

function pickupPointLabel(point: unknown): string {
  if (!point || typeof point !== "object") return "—";
  const record = point as { address?: unknown; name?: unknown };
  const address = typeof record.address === "string" ? record.address : "";
  const name = typeof record.name === "string" ? record.name : "";
  return address || name || "—";
}

function formatStatus(status: string): string {
  const value = String(status || "").toLowerCase();
  if (props.lang === "ru") {
    switch (value) {
      case "pending_payment":
        return "ожидает оплаты";
      case "paid":
        return "оплачен";
      case "shipped":
        return "отправлен";
      case "delivered":
        return "доставлен";
      case "canceled":
        return "отменён";
      default:
        return value || "—";
    }
  }

  switch (value) {
    case "pending_payment":
      return "pending payment";
    case "paid":
      return "paid";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "canceled":
      return "canceled";
    default:
      return value || "—";
  }
}

// Realtime: subscribe to order updates and refetch list/details.
let orderStream: EventSource | null = null;

function closeStream() {
  try {
    orderStream?.close();
  } catch {
    // ignore
  }
  orderStream = null;
}

watch(
  () => auth.state.user?.id,
  (userId) => {
    closeStream();
    if (!userId) return;
    orderStream = new EventSource("/api/orders/stream", { withCredentials: true });
    orderStream.addEventListener("order", () => {
      void loadOrders();
      if (selectedOrderId.value) {
        void loadOrderDetails(selectedOrderId.value);
      }
    });
  }
);

onBeforeUnmount(() => closeStream());

watch(
  () => auth.state.user?.id,
  (userId) => {
    if (!userId) return;
    void loadOrders();
  },
  { immediate: true }
);
</script>

<template>
  <h1>{{ title }}</h1>

  <div v-if="auth.state.user" class="account">
    <div class="account-head">
      <div class="account-email">{{ auth.state.user.email }}</div>
      <button type="button" class="shop-btn shop-btn-secondary" @click="onLogout">{{ logoutLabel }}</button>
    </div>

    <section class="account-orders">
      <h2>{{ lang === "ru" ? "заказы" : "orders" }}</h2>

      <p v-if="ordersStatus === 'error'" class="checkout-hint">{{ ordersMessage }}</p>

      <div v-else class="order-list">
        <button
          v-for="order in orders"
          :key="order.id"
          type="button"
          :class="`order-card ${selectedOrderId === order.id ? 'is-active' : ''}`"
          @click="selectOrder(order.id)"
        >
          <div class="order-card-top">
            <span class="mono">{{ order.id }}</span>
            <span class="order-status">{{ formatStatus(order.status) }}</span>
          </div>
          <div class="order-card-meta">
            <span>{{ formatMoney(order.total) }}</span>
            <span>{{ formatDate(order.createdAt) }}</span>
          </div>
        </button>
      </div>
    </section>

    <section v-if="selectedOrderId" class="account-order">
      <h2>{{ lang === "ru" ? "детали заказа" : "order details" }}</h2>

      <p v-if="orderDetailsStatus === 'error'" class="checkout-hint">{{ orderDetailsMessage }}</p>

      <div v-else-if="selectedOrder" class="order-details">
        <div class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "статус" : "status" }}</div>
          <div class="order-details-value">{{ formatStatus(selectedOrder.status) }}</div>
        </div>
        <div class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "сумма" : "total" }}</div>
          <div class="order-details-value">{{ formatMoney(selectedOrder.total) }}</div>
        </div>
        <div class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "доставка" : "delivery" }}</div>
          <div class="order-details-value">{{ selectedOrder.shippingProvider }}</div>
        </div>
        <div class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "пвз" : "pickup point" }}</div>
          <div class="order-details-value">{{ pickupPointLabel(selectedOrder.pickupPoint) }}</div>
        </div>
        <div class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "примерная дата" : "eta" }}</div>
          <div class="order-details-value">{{ selectedOrder.shippingEta || "—" }}</div>
        </div>
        <div class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "трек-номер" : "tracking" }}</div>
          <div class="order-details-value">{{ selectedOrder.tracking?.number || "—" }}</div>
        </div>
        <div class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "статус доставки" : "delivery status" }}</div>
          <div class="order-details-value">{{ selectedOrder.tracking?.status || "—" }}</div>
        </div>

        <div class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "товары" : "items" }}</div>
          <div class="order-details-value">
            <ul class="order-items">
              <li v-for="item in selectedItems" :key="item.slug">
                {{ item.title }} × {{ item.quantity }} — {{ formatMoney(item.unitPrice) }}
              </li>
            </ul>
          </div>
        </div>

        <div v-if="selectedEvents.length" class="order-details-row">
          <div class="form-label">{{ lang === "ru" ? "история" : "history" }}</div>
          <div class="order-details-value">
            <ul class="order-events">
              <li v-for="event in selectedEvents.slice(-10)" :key="event.id">
                <span class="mono">{{ formatDate(event.createdAt) }}</span> — {{ event.kind }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>

  <div v-else class="auth">
    <div class="auth-tabs">
      <button type="button" :class="`shop-btn ${mode === 'login' ? '' : 'shop-btn-secondary'}`" @click="mode = 'login'">
        {{ loginTitle }}
      </button>
      <button type="button" :class="`shop-btn ${mode === 'register' ? '' : 'shop-btn-secondary'}`" @click="mode = 'register'">
        {{ registerTitle }}
      </button>
    </div>

    <div class="auth-form">
      <label class="form-field">
        <span class="form-label">Email</span>
        <input v-model="email" class="form-input" autocomplete="email" />
      </label>

      <label class="form-field">
        <span class="form-label">{{ lang === "ru" ? "пароль" : "password" }}</span>
        <input v-model="password" class="form-input" type="password" autocomplete="current-password" />
      </label>

      <div class="auth-actions">
        <button v-if="mode === 'register'" type="button" class="shop-btn" :disabled="isLoading" @click="onRegister">
          {{ lang === "ru" ? "зарегистрироваться" : "register" }}
        </button>

        <button v-else type="button" class="shop-btn" :disabled="isLoading" @click="onLogin">
          {{ lang === "ru" ? "войти" : "login" }}
        </button>
      </div>

      <p v-if="message" class="checkout-hint">{{ message }}</p>
    </div>
  </div>
</template>
