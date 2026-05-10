<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ApiError, apiFetchJson } from "@/lib/api";
import { usePublicConfig } from "@/composables/usePublicConfig";
import { loadYandexMaps, type YMapsApi, type YMapsMap, type YMapsPlacemark } from "@/lib/yandexMaps";
import type { Lang } from "@/types/content";
import type { PickupPoint } from "@/types/shipping";

const props = defineProps<{
  lang: Lang;
  provider: string;
  city: string;
  modelValue: PickupPoint | null;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: PickupPoint | null): void;
}>();

const { state: configState } = usePublicConfig();

const status = ref<"idle" | "loading" | "ready" | "error">("idle");
const message = ref("");
const q = ref("");
const points = ref<PickupPoint[]>([]);

const canSearch = computed(() => Boolean(props.provider && props.provider !== "custom" && props.city.trim()));
const searchLabel = computed(() => (props.lang === "ru" ? "найти" : "search"));
const cityLabel = computed(() => (props.lang === "ru" ? "город" : "city"));
const queryLabel = computed(() => (props.lang === "ru" ? "поиск" : "query"));
const selectHint = computed(() =>
  props.lang === "ru" ? "Выберите пункт выдачи из списка или на карте." : "Pick a point from the list or on the map."
);

function providerDefaultQuery(provider: string): string {
  switch (provider) {
    case "cdek":
      return "СДЭК пункт выдачи";
    case "russian_post":
      return "Почта России отделение";
    case "ozon":
      return "Ozon пункт выдачи";
    case "avito":
      return "Avito доставка пункт выдачи";
    default:
      return props.lang === "ru" ? "пункт выдачи" : "pickup point";
  }
}

function hashId(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `pt_${(hash >>> 0).toString(16)}`;
}

async function searchPointsViaYmaps(text: string): Promise<PickupPoint[]> {
  type YmapsGeoObject = {
    geometry?: { getCoordinates?: () => unknown };
    properties?: { get?: (key: string) => unknown };
    getAddressLine?: () => unknown;
  };
  type YmapsGeoObjects = {
    toArray?: () => unknown[];
    each?: (cb: (obj: unknown) => void) => void;
  };
  type YmapsGeocodeResult = { geoObjects?: YmapsGeoObjects };

  const key = configState.config?.yandexMapsApiKey;
  if (!key) {
    throw new Error(props.lang === "ru" ? "Не задан ключ Яндекс.Карт." : "Yandex Maps API key is not configured.");
  }

  const ymaps = await loadYandexMaps(key);
  const result = (await (ymaps.geocode?.(text, { results: 40 }) as unknown as Promise<unknown>)) as YmapsGeocodeResult;
  const geoObjects = result?.geoObjects;
  const items: unknown[] = [];

  if (geoObjects?.toArray) {
    items.push(...geoObjects.toArray());
  } else if (geoObjects?.each) {
    geoObjects.each((obj: unknown) => items.push(obj));
  }

  return items
    .map((item) => {
      const obj = item as YmapsGeoObject;
      const coords = obj?.geometry?.getCoordinates?.();
      const lat = Array.isArray(coords) && Number.isFinite(coords[0]) ? Number(coords[0]) : null;
      const lon = Array.isArray(coords) && Number.isFinite(coords[1]) ? Number(coords[1]) : null;
      if (lat == null || lon == null) return null;

      const nameRaw = obj?.properties?.get?.("name") ?? obj?.properties?.get?.("text") ?? "";
      const name = typeof nameRaw === "string" ? nameRaw : String(nameRaw || "");

      const addressLine = obj?.getAddressLine?.();
      const address = typeof addressLine === "string" ? addressLine : "";

      const id = hashId(`${props.provider}:${name}:${address}:${lat}:${lon}`);

      return {
        id,
        provider: props.provider,
        name: name || text,
        address,
        lat,
        lon
      } satisfies PickupPoint;
    })
    .filter(Boolean) as PickupPoint[];
}

async function fetchPoints() {
  if (!canSearch.value) return;
  status.value = "loading";
  message.value = "";

  try {
    const queryText = q.value.trim();
    const query = queryText || providerDefaultQuery(props.provider);
    const text = props.city ? `${query}, ${props.city}` : query;

    if (!configState.config?.yandexSearchEnabled) {
      const fallbackPoints = await searchPointsViaYmaps(text);
      points.value = fallbackPoints.filter((point) => Boolean(point?.id && Number.isFinite(point.lat) && Number.isFinite(point.lon)));
      status.value = "ready";
      return;
    }

    const params = new URLSearchParams({
      provider: props.provider,
      city: props.city,
      ...(queryText ? { q: queryText } : {})
    } as Record<string, string>);

    const payload = await apiFetchJson<{ ok: boolean; provider: string; points: PickupPoint[] }>(
      `/api/shipping/pickup-points?${params.toString()}`,
      { method: "GET" }
    );

    points.value = (Array.isArray(payload.points) ? payload.points : []).filter(
      (point) => Boolean(point?.id && Number.isFinite(point.lat) && Number.isFinite(point.lon))
    );

    status.value = "ready";
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    const queryText = q.value.trim();
    const query = queryText || providerDefaultQuery(props.provider);
    const text = props.city ? `${query}, ${props.city}` : query;

    const canFallback = Boolean(configState.config?.yandexMapsApiKey) && (apiError?.status ?? 0) !== 400;
    if (canFallback) {
      try {
        const fallbackPoints = await searchPointsViaYmaps(text);
        points.value = fallbackPoints.filter((point) => Boolean(point?.id && Number.isFinite(point.lat) && Number.isFinite(point.lon)));
        status.value = "ready";
        message.value = "";
        return;
      } catch {
        // ignore fallback failure
      }
    }

    points.value = [];
    status.value = "error";
    if (apiError?.status === 501) {
      message.value =
        props.lang === "ru"
          ? "Поиск пунктов выдачи не настроен на сервере. Укажите ключ Яндекс поиска (см. .env.example)."
          : "Pickup points search is not configured on the server. Configure Yandex Search API key (see .env.example).";
    } else {
      message.value = error instanceof Error ? error.message : "Unable to fetch pickup points";
    }
  }
}

watch(
  () => [props.provider, props.city] as const,
  () => {
    points.value = [];
    status.value = "idle";
    message.value = "";
    emit("update:modelValue", null);
  }
);

function selectPoint(point: PickupPoint) {
  emit("update:modelValue", point);
}

const mapEl = ref<HTMLElement | null>(null);
let map: YMapsMap | null = null;
let placemarks: YMapsPlacemark[] = [];
const mapMessage = ref("");

function clearMapMarks() {
  try {
    for (const mark of placemarks) {
      map?.geoObjects?.remove(mark);
    }
  } catch {
    // ignore
  }
  placemarks = [];
}

function setMapMarks(ymaps: YMapsApi) {
  if (!map) return;
  clearMapMarks();

  for (const point of points.value) {
    const mark = new ymaps.Placemark(
      [point.lat, point.lon],
      { balloonContent: `<b>${escapeHtml(point.name)}</b><br/>${escapeHtml(point.address)}` },
      { preset: "islands#blueIcon" }
    );
    mark.events.add("click", () => selectPoint(point));
    map.geoObjects.add(mark);
    placemarks.push(mark);
  }

  if (points.value.length > 0) {
    const bounds = map.geoObjects.getBounds();
    if (bounds) {
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 24 });
    }
  }
}

watch(points, async () => {
  const key = configState.config?.yandexMapsApiKey;
  if (!key || !mapEl.value) return;

  try {
    const ymaps = await loadYandexMaps(key);
    if (!map) {
      map = new ymaps.Map(mapEl.value, {
        center: [55.751244, 37.618423],
        zoom: 9,
        controls: ["zoomControl"]
      });
    }
    setMapMarks(ymaps);
    mapMessage.value = "";
  } catch {
    mapMessage.value = props.lang === "ru" ? "Карта не загрузилась. Проверьте ключ и CSP." : "Map failed to load. Check API key and CSP.";
  }
});

onMounted(async () => {
  const key = configState.config?.yandexMapsApiKey;
  if (!key || !mapEl.value) return;
  try {
    const ymaps = await loadYandexMaps(key);
    if (!map) {
      map = new ymaps.Map(mapEl.value, {
        center: [55.751244, 37.618423],
        zoom: 9,
        controls: ["zoomControl"]
      });
    }
    setMapMarks(ymaps);
    mapMessage.value = "";
  } catch {
    mapMessage.value = props.lang === "ru" ? "Карта не загрузилась. Проверьте ключ и CSP." : "Map failed to load. Check API key and CSP.";
  }
});

onBeforeUnmount(() => {
  clearMapMarks();
  try {
    map?.destroy?.();
  } catch {
    // ignore
  }
  map = null;
});

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
</script>

<template>
  <div class="pickup">
    <div class="pickup-controls">
      <div class="pickup-control">
        <div class="form-label">{{ cityLabel }}</div>
        <div class="pickup-value">{{ city || "—" }}</div>
      </div>

      <label class="form-field">
        <span class="form-label">{{ queryLabel }}</span>
        <input v-model="q" class="form-input" :placeholder="lang === 'ru' ? 'Например: центр' : 'e.g. downtown'" />
      </label>

      <button type="button" class="shop-btn" :disabled="!canSearch || status === 'loading'" @click="fetchPoints">
        {{ searchLabel }}
      </button>
    </div>

    <p class="pickup-hint">{{ selectHint }}</p>

    <p v-if="status === 'error'" class="pickup-error">{{ message }}</p>

    <div class="pickup-grid">
      <div class="pickup-list">
        <button
          v-for="point in points"
          :key="point.id"
          type="button"
          :class="`pickup-item ${modelValue?.id === point.id ? 'is-active' : ''}`"
          @click="selectPoint(point)"
        >
          <div class="pickup-name">{{ point.name }}</div>
          <div class="pickup-address">{{ point.address }}</div>
        </button>

        <p v-if="status === 'ready' && points.length === 0" class="pickup-empty">
          {{ lang === "ru" ? "Ничего не найдено." : "Nothing found." }}
        </p>
      </div>

      <div class="pickup-map">
        <div ref="mapEl" class="pickup-map-inner" />
        <p v-if="!configState.config?.yandexMapsApiKey" class="pickup-map-disabled">
          {{
            lang === "ru"
              ? "Карта недоступна (нет YANDEX_MAPS_JS_API_KEY)."
              : "Map is disabled (missing YANDEX_MAPS_JS_API_KEY)."
          }}
        </p>
        <p v-else-if="mapMessage" class="pickup-map-disabled">{{ mapMessage }}</p>
      </div>
    </div>
  </div>
</template>
