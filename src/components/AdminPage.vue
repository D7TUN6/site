<script setup lang="ts">
import { reactive, ref } from "vue";
import { useAdmin, type AdminOrder, type AdminRelease } from "@/composables/useAdmin";
import UiSelect from "@/components/UiSelect.vue";
import FileUploadButton from "@/components/FileUploadButton.vue";
import type { Lang } from "@/types/content";

const props = defineProps<{
  lang: Lang;
}>();

const admin = useAdmin();
const { lang } = props;

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

type TrackEditItem = { filename: string; title: string; deleted: boolean };
type ReleaseEdit = {
  albumName: string;
  notes: string;
  releaseType: string;
  releaseDate: string;
  deleteCover: boolean;
  tracks: TrackEditItem[];
  cover: File | null;
  newTracks: File[];
};
const releaseEdits = reactive<Record<string, ReleaseEdit>>({});
const releaseEditOpen = ref<string | null>(null);
const releaseActionStatus = reactive<Record<string, "idle" | "loading" | "error">>({});
const releaseActionMessage = reactive<Record<string, string>>({});
const releaseTrackDragIndex = reactive<Record<string, number | null>>({});

const confirmModal = reactive<{ open: boolean; text: string; onConfirm: (() => void) | null }>({
  open: false,
  text: "",
  onConfirm: null
});

function showConfirm(text: string, onConfirm: () => void) {
  confirmModal.text = text;
  confirmModal.onConfirm = onConfirm;
  confirmModal.open = true;
}

function confirmModalAccept() {
  confirmModal.onConfirm?.();
  confirmModal.open = false;
}

function confirmModalCancel() {
  confirmModal.open = false;
}

function openReleaseEdit(release: AdminRelease) {
  releaseEdits[release.slug] = {
    albumName: release.albumName,
    notes: release.notes || "",
    releaseType: release.releaseType || "album",
    releaseDate: release.releaseDate || "",
    deleteCover: false,
    tracks: release.tracks.map((t) => ({ filename: t.filename, title: t.title, deleted: false })),
    cover: null,
    newTracks: []
  };
  releaseTrackDragIndex[release.slug] = null;
  releaseEditOpen.value = release.slug;
}

function closeReleaseEdit() {
  releaseEditOpen.value = null;
}

function onEditCoverUpdate(slug: string, files: File[]) {
  if (releaseEdits[slug]) releaseEdits[slug].cover = files[0] || null;
}

function onEditNewTracksUpdate(slug: string, files: File[]) {
  if (releaseEdits[slug]) releaseEdits[slug].newTracks = files;
}

function removeEditTrack(slug: string, index: number) {
  if (releaseEdits[slug]) releaseEdits[slug].tracks[index].deleted = true;
}

function restoreEditTrack(slug: string, index: number) {
  if (releaseEdits[slug]) releaseEdits[slug].tracks[index].deleted = false;
}

function onTrackDragStart(slug: string, index: number) {
  releaseTrackDragIndex[slug] = index;
}

function onTrackDragEnd(slug: string) {
  releaseTrackDragIndex[slug] = null;
}

function onTrackDragOver(event: DragEvent, slug: string, index: number) {
  event.preventDefault();
  const from = releaseTrackDragIndex[slug];
  if (from === null || from === undefined || from === index) return;
  const items = releaseEdits[slug].tracks;
  const dragged = items[from];
  items.splice(from, 1);
  items.splice(index, 0, dragged);
  releaseTrackDragIndex[slug] = index;
}

async function saveRelease(release: AdminRelease) {
  const edit = releaseEdits[release.slug];
  if (!edit) return;
  releaseActionStatus[release.slug] = "loading";
  releaseActionMessage[release.slug] = "";
  try {
    const patch: Parameters<typeof admin.updateRelease>[1] = {};

    if (edit.albumName.trim() && edit.albumName.trim() !== release.albumName) {
      patch.albumName = edit.albumName.trim();
    }
    if (edit.notes.trim() !== release.notes) {
      patch.notes = edit.notes.trim();
    }
    if (edit.releaseType !== release.releaseType) {
      patch.releaseType = edit.releaseType;
    }
    if (edit.releaseDate.trim() !== (release.releaseDate || "")) {
      patch.releaseDate = edit.releaseDate.trim();
    }
    if (edit.deleteCover) {
      patch.deleteCover = true;
    }

    const deleted = edit.tracks.filter((t) => t.deleted).map((t) => t.filename).filter(Boolean);
    if (deleted.length > 0) patch.trackDeletes = deleted;

    const renames: Record<string, string> = {};
    for (const t of edit.tracks) {
      if (t.deleted || !t.filename) continue;
      const origTrack = release.tracks.find((ot) => ot.filename === t.filename);
      if (origTrack && t.title !== origTrack.title) {
        const basename = t.filename.includes("/") ? t.filename.slice(t.filename.lastIndexOf("/") + 1) : t.filename;
        const dir = t.filename.includes("/") ? t.filename.slice(0, t.filename.lastIndexOf("/") + 1) : "";
        const ext = basename.includes(".") ? basename.slice(basename.lastIndexOf(".")) : "";
        renames[t.filename] = dir + t.title + ext;
      }
    }
    if (Object.keys(renames).length > 0) patch.trackRenames = renames;

    if (edit.cover) patch.cover = edit.cover;
    if (edit.newTracks.length > 0) patch.newTracks = edit.newTracks;

    if (Object.keys(patch).length === 0) {
      releaseEditOpen.value = null;
      releaseActionStatus[release.slug] = "idle";
      return;
    }

    await admin.updateRelease(release.slug, patch);
    releaseActionStatus[release.slug] = "idle";
    releaseEditOpen.value = null;
  } catch (error) {
    releaseActionStatus[release.slug] = "error";
    releaseActionMessage[release.slug] = error instanceof Error ? error.message : "Update failed";
  }
}

function deleteRelease(release: AdminRelease) {
  showConfirm(
    lang === "ru"
      ? `Удалить релиз «${release.albumName}»? Это действие необратимо.`
      : `Delete release "${release.albumName}"? This cannot be undone.`,
    async () => {
      releaseActionStatus[release.slug] = "loading";
      releaseActionMessage[release.slug] = "";
      try {
        await admin.deleteRelease(release.slug);
        releaseActionStatus[release.slug] = "idle";
      } catch (error) {
        releaseActionStatus[release.slug] = "error";
        releaseActionMessage[release.slug] = error instanceof Error ? error.message : "Delete failed";
      }
    }
  );
}

const releaseTypeOptions = [
  { value: "album", label: "Album" },
  { value: "lp", label: "LP" },
  { value: "ep", label: "EP" },
  { value: "single", label: "Single" },
  { value: "remaster", label: "Remaster" },
  { value: "deluxe", label: "Deluxe Edition" }
];

const uploadForm = reactive<{
  albumName: string;
  releaseType: string;
  releaseDate: string;
  releaseNotes: string;
  tracks: File[];
  cover: File | null;
}>({
  albumName: "",
  releaseType: "album",
  releaseDate: "",
  releaseNotes: "",
  tracks: [],
  cover: null
});
const uploadStatus = ref<"idle" | "loading" | "success" | "error">("idle");
const uploadMessage = ref("");

function onTracksUpdate(files: File[]) {
  uploadForm.tracks = files;
}

function onCoverUpdate(files: File[]) {
  uploadForm.cover = files[0] || null;
}

async function uploadRelease() {
  if (!uploadForm.albumName.trim()) {
    uploadMessage.value = "Album name is required";
    uploadStatus.value = "error";
    return;
  }

  if (uploadForm.tracks.length === 0) {
    uploadMessage.value = "At least one track file is required";
    uploadStatus.value = "error";
    return;
  }

  if (!uploadForm.releaseDate.trim()) {
    uploadMessage.value = "Release date is required (DD/MM/YYYY)";
    uploadStatus.value = "error";
    return;
  }

  // Validate date format
  const dateMatch = uploadForm.releaseDate.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dateMatch) {
    uploadMessage.value = "Invalid date format. Use DD/MM/YYYY";
    uploadStatus.value = "error";
    return;
  }

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    uploadMessage.value = "Invalid date values";
    uploadStatus.value = "error";
    return;
  }

  uploadStatus.value = "loading";
  uploadMessage.value = "";

  try {
    const formData = new FormData();
    formData.append("albumName", uploadForm.albumName.trim());
    formData.append("releaseType", uploadForm.releaseType);
    formData.append("releaseDate", uploadForm.releaseDate.trim());

    if (uploadForm.releaseNotes.trim()) {
      formData.append("releaseNotes", uploadForm.releaseNotes.trim());
    }

    for (const track of uploadForm.tracks) {
      formData.append("tracks[]", track);
    }

    if (uploadForm.cover) {
      formData.append("cover", uploadForm.cover);
    }

    const response = await fetch("/api/admin/releases", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(error.error || "Upload failed");
    }

    const result = await response.json();
    uploadStatus.value = "success";
    uploadMessage.value = `Release "${result.albumName}" uploaded successfully with ${result.tracks.length} tracks`;

    uploadForm.albumName = "";
    uploadForm.releaseType = "album";
    uploadForm.releaseDate = "";
    uploadForm.releaseNotes = "";
    uploadForm.tracks = [];
    uploadForm.cover = null;

  } catch (error) {
    uploadStatus.value = "error";
    uploadMessage.value = error instanceof Error ? error.message : "Upload failed";
  }
}
</script>

<template>
  <h1>{{ lang === "ru" ? "админ" : "admin" }}</h1>

  <Teleport to="body">
    <div v-if="confirmModal.open" class="confirm-overlay" @click.self="confirmModalCancel">
      <div class="confirm-dialog" role="dialog" aria-modal="true">
        <p class="confirm-text">{{ confirmModal.text }}</p>
        <div class="confirm-actions">
          <button type="button" class="shop-btn shop-btn-danger" @click="confirmModalAccept">
            {{ lang === "ru" ? "удалить" : "delete" }}
          </button>
          <button type="button" class="shop-btn shop-btn-secondary" @click="confirmModalCancel">
            {{ lang === "ru" ? "отмена" : "cancel" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

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

    <div class="admin-section">
      <h2>{{ lang === "ru" ? "Загрузка релиза" : "Upload Release" }}</h2>

      <div class="upload-form">
        <label class="form-field">
          <span class="form-label">{{ lang === "ru" ? "Название альбома" : "Album Name" }}</span>
          <input v-model="uploadForm.albumName" class="form-input" :placeholder="lang === 'ru' ? 'Введите название альбома' : 'Enter album name'" />
        </label>

        <label class="form-field">
          <span class="form-label">{{ lang === "ru" ? "Тип релиза" : "Release Type" }}</span>
          <UiSelect
            v-model="uploadForm.releaseType"
            :options="releaseTypeOptions"
            :aria-label="lang === 'ru' ? 'тип релиза' : 'release type'"
          />
        </label>

        <label class="form-field">
          <span class="form-label">{{ lang === "ru" ? "Дата релиза (ДД/ММ/ГГГГ)" : "Release Date (DD/MM/YYYY)" }}</span>
          <input
            v-model="uploadForm.releaseDate"
            class="form-input"
            :placeholder="lang === 'ru' ? '17/12/2025' : '17/12/2025'"
          />
        </label>

        <label class="form-field form-field-full">
          <span class="form-label">{{ lang === "ru" ? "Release Notes (опционально)" : "Release Notes (optional)" }}</span>
          <textarea
            v-model="uploadForm.releaseNotes"
            class="form-textarea"
            rows="4"
            :placeholder="lang === 'ru' ? 'Описание релиза, дата выхода и т.д.' : 'Release description, release date, etc.'"
          />
        </label>

        <div class="form-field form-field-full">
          <span class="form-label">{{ lang === "ru" ? "Треки (WAV/FLAC/MP3/OGG)" : "Tracks (WAV/FLAC/MP3/OGG)" }}</span>
          <FileUploadButton
            accept=".wav,.flac,.mp3,.ogg"
            :multiple="true"
            :label="lang === 'ru' ? 'Выбрать треки' : 'Select Tracks'"
            :lang="lang"
            @update:files="onTracksUpdate"
          />
        </div>

        <div class="form-field form-field-full">
          <span class="form-label">{{ lang === "ru" ? "Обложка (опционально)" : "Cover Art (optional)" }}</span>
          <FileUploadButton
            accept="image/*"
            :multiple="false"
            :label="lang === 'ru' ? 'Выбрать обложку' : 'Select Cover'"
            :lang="lang"
            @update:files="onCoverUpdate"
          />
        </div>

        <button
          type="button"
          class="shop-btn"
          :disabled="uploadStatus === 'loading'"
          @click="uploadRelease"
        >
          {{ uploadStatus === "loading" ? (lang === "ru" ? "Загрузка..." : "Uploading...") : (lang === "ru" ? "Загрузить релиз" : "Upload Release") }}
        </button>

        <p v-if="uploadMessage" :class="['checkout-hint', uploadStatus === 'success' ? 'success' : uploadStatus === 'error' ? 'error' : '']">
          {{ uploadMessage }}
        </p>
      </div>
    </div>

    <div class="admin-section">
      <h2>{{ lang === "ru" ? "Релизы" : "Releases" }}</h2>

      <button type="button" class="shop-btn shop-btn-secondary" @click="admin.loadReleases">
        {{ lang === "ru" ? "обновить" : "refresh" }}
      </button>

      <div class="order-list">
        <div v-for="release in admin.state.releases" :key="release.slug" class="admin-order-card">
          <div class="order-card-top">
            <span>{{ release.albumName }}</span>
            <span class="mono">{{ release.slug }}</span>
          </div>

          <div v-if="releaseEditOpen === release.slug" class="admin-order-edit">
            <label class="form-field">
              <span class="form-label">{{ lang === "ru" ? "Название" : "Album Name" }}</span>
              <input v-model="releaseEdits[release.slug].albumName" class="form-input" />
            </label>

            <label class="form-field">
              <span class="form-label">{{ lang === "ru" ? "Тип релиза" : "Release Type" }}</span>
              <UiSelect
                v-model="releaseEdits[release.slug].releaseType"
                :options="releaseTypeOptions"
                :aria-label="lang === 'ru' ? 'тип релиза' : 'release type'"
              />
            </label>

            <label class="form-field">
              <span class="form-label">{{ lang === "ru" ? "Дата релиза (ДД/ММ/ГГГГ)" : "Release Date (DD/MM/YYYY)" }}</span>
              <input
                v-model="releaseEdits[release.slug].releaseDate"
                class="form-input"
                :placeholder="lang === 'ru' ? '17/12/2025' : '17/12/2025'"
              />
            </label>

            <label class="form-field form-field-full">
              <span class="form-label">{{ lang === "ru" ? "Заметки" : "Notes" }}</span>
              <textarea v-model="releaseEdits[release.slug].notes" class="form-textarea" rows="8" />
            </label>

            <div class="form-field form-field-full">
              <span class="form-label">{{ lang === "ru" ? "Текущая обложка" : "Current Cover" }}</span>
              <div class="cover-preview-container">
                <img
                  v-if="release.coverUrl && !releaseEdits[release.slug].deleteCover"
                  :src="release.coverUrl"
                  alt="Cover"
                  class="cover-preview"
                />
                <div v-else class="cover-preview cover-preview-empty" />
                <button
                  v-if="release.coverUrl && !releaseEdits[release.slug].deleteCover"
                  type="button"
                  class="shop-btn shop-btn-danger cover-delete-btn"
                  @click="releaseEdits[release.slug].deleteCover = true"
                >
                  {{ lang === "ru" ? "Удалить обложку" : "Delete Cover" }}
                </button>
                <button
                  v-else-if="releaseEdits[release.slug].deleteCover"
                  type="button"
                  class="shop-btn shop-btn-secondary cover-delete-btn"
                  @click="releaseEdits[release.slug].deleteCover = false"
                >
                  {{ lang === "ru" ? "Отменить удаление" : "Undo Delete" }}
                </button>
              </div>
            </div>

            <div class="form-field form-field-full">
              <span class="form-label">{{ lang === "ru" ? "Треки" : "Tracks" }}</span>
              <ul class="file-upload-list">
                <li
                  v-for="(track, idx) in releaseEdits[release.slug].tracks"
                  :key="track.filename + idx"
                  :class="['file-upload-item', { 'track-deleted': track.deleted, 'is-dragging': releaseTrackDragIndex[release.slug] === idx }]"
                  :draggable="!track.deleted"
                  @dragstart="onTrackDragStart(release.slug, idx)"
                  @dragend="onTrackDragEnd(release.slug)"
                  @dragover="onTrackDragOver($event, release.slug, idx)"
                >
                  <span class="file-upload-drag-handle track-drag-handle">⠿</span>
                  <input
                    v-if="!track.deleted"
                    v-model="track.title"
                    class="file-upload-item-input"
                    :placeholder="track.filename"
                  />
                  <span v-else class="file-upload-item-input track-deleted-label">{{ track.title || track.filename }}</span>
                  <button
                    v-if="!track.deleted"
                    type="button"
                    class="file-upload-remove-btn"
                    :aria-label="lang === 'ru' ? 'Удалить' : 'Remove'"
                    @click="removeEditTrack(release.slug, idx)"
                  >✕</button>
                  <button
                    v-else
                    type="button"
                    class="file-upload-remove-btn track-restore-btn"
                    :aria-label="lang === 'ru' ? 'Восстановить' : 'Restore'"
                    @click="restoreEditTrack(release.slug, idx)"
                  >↩</button>
                </li>
              </ul>
            </div>

            <div class="form-field form-field-full">
              <span class="form-label">{{ lang === "ru" ? "Добавить треки" : "Add Tracks" }}</span>
              <FileUploadButton
                accept=".wav,.flac,.mp3,.ogg"
                :multiple="true"
                :label="lang === 'ru' ? 'Выбрать треки' : 'Select Tracks'"
                :lang="lang"
                @update:files="onEditNewTracksUpdate(release.slug, $event)"
              />
            </div>

            <div class="form-field form-field-full">
              <span class="form-label">{{ lang === "ru" ? "Заменить обложку" : "Replace Cover" }}</span>
              <FileUploadButton
                accept="image/*"
                :multiple="false"
                :label="lang === 'ru' ? 'Выбрать обложку' : 'Select Cover'"
                :lang="lang"
                @update:files="onEditCoverUpdate(release.slug, $event)"
              />
            </div>

            <div class="release-edit-actions">
              <button type="button" class="shop-btn" :disabled="releaseActionStatus[release.slug] === 'loading'" @click="saveRelease(release)">
                {{ releaseActionStatus[release.slug] === "loading" ? "..." : (lang === "ru" ? "сохранить" : "save") }}
              </button>
              <button type="button" class="shop-btn shop-btn-secondary" @click="closeReleaseEdit">
                {{ lang === "ru" ? "отмена" : "cancel" }}
              </button>
            </div>
            <p v-if="releaseActionMessage[release.slug]" class="checkout-hint error release-edit-full">
              {{ releaseActionMessage[release.slug] }}
            </p>
          </div>

          <div v-else class="release-card-actions">
            <button type="button" class="shop-btn shop-btn-secondary" @click="openReleaseEdit(release)">
              {{ lang === "ru" ? "редактировать" : "edit" }}
            </button>
            <button type="button" class="shop-btn shop-btn-danger" :disabled="releaseActionStatus[release.slug] === 'loading'" @click="deleteRelease(release)">
              {{ releaseActionStatus[release.slug] === "loading" ? "..." : (lang === "ru" ? "удалить" : "delete") }}
            </button>
            <p v-if="releaseActionMessage[release.slug]" class="checkout-hint error">
              {{ releaseActionMessage[release.slug] }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <h2>{{ lang === "ru" ? "Заказы" : "Orders" }}</h2>

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

<style scoped>
.admin-section {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  margin-bottom: 2rem;
  padding: 1.5rem;
}

.admin-section h2 {
  color: var(--text-color);
  font-family: var(--font-ui);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin: 0 0 1.5rem 0;
}

.upload-form {
  display: grid;
  gap: 1.2rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  max-width: 100%;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field-full {
  grid-column: 1 / -1;
}

.form-label {
  color: var(--text-color);
  font-family: var(--font-ui);
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.form-input,
.form-textarea {
  -webkit-appearance: none;
  appearance: none;
  background: var(--ui-surface-2);
  border: 1px solid var(--ui-border);
  border-radius: 0;
  color: var(--text-color);
  font-family: var(--font-ui);
  font-size: 0.9rem;
  padding: 8px 12px;
  transition: border-color var(--transition-speed), background-color var(--transition-speed);
}

.form-input:hover,
.form-textarea:hover {
  border-color: var(--ui-border-strong);
}

.form-input:focus,
.form-textarea:focus {
  background: var(--ui-surface);
  border-color: var(--accent-hot);
  box-shadow: 0 0 0 2px rgba(0, 255, 106, 0.2);
  outline: none;
}

.form-textarea {
  resize: vertical;
}

.checkout-hint {
  color: var(--muted-color);
  font-size: 0.85rem;
  margin: 0;
}

.checkout-hint.success {
  color: var(--accent-hot);
}

.checkout-hint.error {
  color: var(--danger-color);
}

.shop-btn-danger {
  background: transparent;
  border: 1px solid var(--danger-color);
  color: var(--danger-color);
}

.shop-btn-danger:hover:not(:disabled) {
  background: var(--danger-color);
  color: #fff;
}

.order-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.admin-order-card {
  background: var(--ui-surface-2);
  border: 1px solid var(--ui-border);
  padding: 1rem;
}

.admin-order-edit {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  margin-top: 1rem;
}

.release-edit-actions {
  display: flex;
  gap: 0.5rem;
  grid-column: 1 / -1;
}

.release-edit-full {
  grid-column: 1 / -1;
}

.release-card-actions {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.file-upload-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-upload-item {
  align-items: center;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  cursor: move;
  display: grid;
  gap: 8px;
  grid-template-columns: auto 1fr auto;
  padding: 8px 10px;
  transition: background-color var(--transition-speed), border-color var(--transition-speed);
}

.file-upload-item:hover {
  background: var(--ui-surface-2);
  border-color: var(--ui-border-strong);
}

.file-upload-item.is-dragging {
  opacity: 0.5;
}

.file-upload-item.track-deleted {
  opacity: 0.45;
}

.track-drag-handle {
  color: var(--muted-color);
  cursor: move;
  font-style: normal;
  line-height: 1;
}

.file-upload-item-input {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-color);
  font-family: var(--font-ui);
  font-size: 0.9rem;
  padding: 4px 6px;
  transition: border-color var(--transition-speed), background-color var(--transition-speed);
  width: 100%;
}

.file-upload-item-input:hover {
  background: var(--ui-surface-2);
  border-color: var(--ui-border);
}

.file-upload-item-input:focus {
  background: var(--ui-surface-2);
  border-color: var(--accent-hot);
  outline: none;
}

.track-deleted-label {
  display: block;
  text-decoration: line-through;
}

.file-upload-remove-btn {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted-color);
  cursor: var(--cursor-link-select, pointer);
  display: flex;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  height: 28px;
  justify-content: center;
  padding: 0;
  transition: color var(--transition-speed), border-color var(--transition-speed);
  width: 28px;
}

.file-upload-remove-btn:hover {
  border-color: var(--ui-border-strong);
  color: var(--danger-color);
}

.track-restore-btn {
  color: var(--accent-hot);
}

.track-restore-btn:hover {
  color: var(--accent-hot);
  border-color: var(--accent-hot);
}

.confirm-overlay {
  align-items: center;
  background: rgba(0, 0, 0, 0.72);
  bottom: 0;
  display: flex;
  justify-content: center;
  left: 0;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 1000;
}

.confirm-dialog {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border-strong);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 420px;
  padding: 2rem;
  width: 90%;
}

.confirm-text {
  color: var(--text-color);
  font-family: var(--font-ui);
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0;
}

.confirm-actions {
  display: flex;
  gap: 0.75rem;
}

.cover-preview-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cover-preview {
  aspect-ratio: 1 / 1;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--ui-border);
  display: block;
  max-width: 240px;
  object-fit: cover;
  width: 100%;
}

.cover-preview-empty {
  background: #000;
}

.cover-delete-btn {
  align-self: flex-start;
}
</style>
