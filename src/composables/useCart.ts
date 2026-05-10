import { computed, reactive, watch } from "vue";

type CartItem = {
  slug: string;
  quantity: number;
};

type CartState = {
  items: Record<string, CartItem>;
};

const STORAGE_KEY = "d7tun6.site.cart.v1";

function safeParseCart(raw: string | null): CartState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<CartState>;
    if (!candidate.items || typeof candidate.items !== "object") return null;

    const items: Record<string, CartItem> = {};
    for (const [key, value] of Object.entries(candidate.items)) {
      if (!key || typeof key !== "string") continue;
      if (!value || typeof value !== "object") continue;
      const v = value as Partial<CartItem>;
      const slug = typeof v.slug === "string" ? v.slug : key;
      const quantity = typeof v.quantity === "number" && Number.isFinite(v.quantity) ? Math.floor(v.quantity) : 0;
      if (!slug || quantity <= 0) continue;
      items[slug] = { slug, quantity };
    }

    return { items };
  } catch {
    return null;
  }
}

function loadInitialState(): CartState {
  if (typeof window === "undefined") {
    return { items: {} };
  }

  const parsed = safeParseCart(window.localStorage.getItem(STORAGE_KEY));
  return parsed ?? { items: {} };
}

const state = reactive<CartState>(loadInitialState());
let isStorageListenerInstalled = false;
let isWatcherInstalled = false;

function saveState(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items }));
  } catch {
    // Ignore storage quota / privacy errors.
  }
}

function installStorageListenerOnce(): void {
  if (isStorageListenerInstalled) return;
  if (typeof window === "undefined") return;

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = safeParseCart(event.newValue);
    state.items = next?.items ?? {};
  });
  isStorageListenerInstalled = true;
}

export function useCart() {
  installStorageListenerOnce();

  if (!isWatcherInstalled) {
    isWatcherInstalled = true;
    watch(
      () => state.items,
      () => saveState(),
      { deep: true }
    );
  }

  const items = computed(() => Object.values(state.items));
  const totalItems = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0));

  function getQuantity(slug: string): number {
    return state.items[slug]?.quantity ?? 0;
  }

  function setQuantity(slug: string, quantity: number): void {
    const normalized = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
    if (normalized <= 0) {
      delete state.items[slug];
      return;
    }

    state.items[slug] = { slug, quantity: normalized };
  }

  function increment(slug: string, delta = 1): void {
    const step = Number.isFinite(delta) ? Math.floor(delta) : 1;
    if (step <= 0) return;
    setQuantity(slug, getQuantity(slug) + step);
  }

  function decrement(slug: string, delta = 1): void {
    const step = Number.isFinite(delta) ? Math.floor(delta) : 1;
    if (step <= 0) return;
    setQuantity(slug, getQuantity(slug) - step);
  }

  function clear(): void {
    state.items = {};
  }

  return {
    items,
    totalItems,
    getQuantity,
    setQuantity,
    increment,
    decrement,
    clear
  };
}
