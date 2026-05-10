<script setup lang="ts">
import { reactive, ref } from "vue";
import { useAdmin, type AdminOrder } from "@/composables/useAdmin";
import UiSelect from "@/components/UiSelect.vue";
import type { Lang } from "@/types/content";

defineProps<{
  lang: Lang;
}>();

const admin = useAdmin();

const email = ref("");
const password = ref("");
const loginStatus = ref<"idle" | "loading" | "error">("idle");
const loginMessage = ref("");

async function onLogin() {
  loginStatus.value = "loading";
  loginMessage.value = "";
  try {
    await admin.login({ email: email.value, password: password.value });
    loginStatus.value = "idle";
  } catch (error) {
    loginStatus.value = "error";
    loginMessage.value = error instanceof Error ? error.message : "Unable to login";
  }
}

async function onLogout() {
  await admin.logout();
}

function formatMinor(minor: number | null | undefined): string {
  const safe = Number.isFinite(minor) ? Math.floor(Number(minor)) : 0;
  const rub = Math.floor(safe / 100);
  const kop = Math.abs(safe % 100);
  return `${rub}.${String(kop).padStart(2, "0")} ₽`;
}

function pickupPointLabel(point: unknown): string {
  if (!point || typeof point !== "object") return "—";
  const record = point as { address?: unknown; name?: unknown };
  const address = typeof record.address === "string" ? record.address : "";
  const name = typeof record.name === "string" ? record.name : "";
  return address || name || "—";
}

type OrderEdit = {
  status: string;
  shippingEta: string;
  trackingNumber: string;
  trackingStatus: string;
  comment: string;
};

const edits = reactive<Record<string, OrderEdit>>({});

const statusOptions = [
  { value: "pending_payment", label: "pending_payment" },
  { value: "paid", label: "paid" },
  { value: "shipped", label: "shipped" },
  { value: "delivered", label: "delivered" },
  { value: "canceled", label: "canceled" }
];

function ensureEdit(order: AdminOrder): OrderEdit {
  if (!edits[order.id]) {
    edits[order.id] = {
      status: String(order.status || ""),
      shippingEta: String(order.shippingEta || ""),
      trackingNumber: String(order.tracking?.number || ""),
      trackingStatus: String(order.tracking?.status || ""),
      comment: String(order.comment || "")
    };
  }
  return edits[order.id];
}

async function saveOrder(order: AdminOrder) {
  const edit = ensureEdit(order);
  const patch: Record<string, unknown> = {
    status: edit.status,
    shippingEta: edit.shippingEta,
    trackingNumber: edit.trackingNumber,
    trackingStatus: edit.trackingStatus,
    comment: edit.comment
  };

  if (edit.trackingNumber.trim() && edit.status === "paid") {
    patch.status = "shipped";
    edit.status = "shipped";
  }

  await admin.updateOrder(order.id, patch);
}
</script>

<template>
  <h1>{{ lang === "ru" ? "админ" : "admin" }}</h1>

  <div v-if="!admin.state.isAdmin" class="auth">
    <div class="auth-form">
      <label class="form-field">
        <span class="form-label">Email</span>
        <input v-model="email" class="form-input" autocomplete="username" />
      </label>
      <label class="form-field">
        <span class="form-label">{{ lang === "ru" ? "пароль" : "password" }}</span>
        <input v-model="password" class="form-input" type="password" autocomplete="current-password" />
      </label>
      <button type="button" class="shop-btn" :disabled="loginStatus === 'loading'" @click="onLogin">
        {{ lang === "ru" ? "войти" : "login" }}
      </button>
      <p v-if="loginMessage" class="checkout-hint">{{ loginMessage }}</p>
    </div>
  </div>

  <div v-else class="admin">
    <div class="account-head">
      <div class="account-email">{{ lang === "ru" ? "админ панель" : "admin panel" }}</div>
      <button type="button" class="shop-btn shop-btn-secondary" @click="onLogout">{{ lang === "ru" ? "выйти" : "logout" }}</button>
    </div>

    <div class="admin-orders">
      <button type="button" class="shop-btn shop-btn-secondary" @click="admin.loadOrders">
        {{ lang === "ru" ? "обновить" : "refresh" }}
      </button>

      <div class="order-list">
        <div v-for="order in admin.state.orders" :key="order.id" class="admin-order-card">
          <div class="order-card-top">
            <span class="mono">{{ order.id }}</span>
            <span class="order-status">{{ order.status }}</span>
          </div>
          <div class="order-card-meta">
            <span>{{ order.email }}</span>
            <span>{{ formatMinor(order.itemsTotalMinor) }}</span>
          </div>
          <div class="order-card-meta">
            <span>{{ order.shippingProvider }}</span>
            <span>{{ pickupPointLabel(order.pickupPoint) }}</span>
          </div>

          <div class="admin-order-edit">
            <label class="form-field">
              <span class="form-label">{{ lang === "ru" ? "статус" : "status" }}</span>
              <UiSelect
                v-model="ensureEdit(order).status"
                :options="statusOptions"
                :aria-label="lang === 'ru' ? 'статус' : 'status'"
              />
            </label>

            <label class="form-field">
              <span class="form-label">{{ lang === "ru" ? "примерная дата" : "eta" }}</span>
              <input v-model="ensureEdit(order).shippingEta" class="form-input" />
            </label>

            <label class="form-field">
              <span class="form-label">{{ lang === "ru" ? "трек-номер" : "tracking number" }}</span>
              <input v-model="ensureEdit(order).trackingNumber" class="form-input" />
            </label>

            <label class="form-field">
              <span class="form-label">{{ lang === "ru" ? "статус доставки" : "delivery status" }}</span>
              <input v-model="ensureEdit(order).trackingStatus" class="form-input" />
            </label>

            <label class="form-field form-field-full">
              <span class="form-label">{{ lang === "ru" ? "комментарий" : "comment" }}</span>
              <textarea v-model="ensureEdit(order).comment" class="form-textarea" rows="2" />
            </label>

            <button type="button" class="shop-btn" @click="saveOrder(order)">
              {{ lang === "ru" ? "сохранить" : "save" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
