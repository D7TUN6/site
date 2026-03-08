<script setup lang="ts">
import { computed, ref } from "vue";
import { Pause, Play } from "lucide-vue-next";
import { usePlayer, type GlobalPlayerQueue } from "@/composables/usePlayer";
import type { ReleaseEntry } from "@/types/content";

type DownloadFormat = "flac" | "mp3" | "ogg" | "wav";

const props = defineProps<{
  lang: "en" | "ru";
  release: ReleaseEntry;
}>();

const {
  state,
  setQueue,
  togglePlayPause,
  playTrack,
  seekByRatio
} = usePlayer();

const queuePayload = computed<GlobalPlayerQueue>(() => ({
  queueKey: props.release.slug,
  albumSlug: props.release.slug,
  albumTitle: props.release.albumName,
  artist: "D7TUN6",
  coverUrl: props.release.coverPreviewUrl || props.release.coverUrl,
  releaseDate: props.release.releaseDate,
  genre: props.lang === "ru" ? props.release.genre.ru : props.release.genre.en,
  tracks: props.release.tracks.map((track) => ({
    title: track.title,
    url: track.url,
    streamUrl: track.streamUrl,
    fallbackUrl: track.sourceUrl,
    duration: track.duration,
    links: track.links
  }))
}));

const isRu = computed(() => props.lang === "ru");
const isActiveQueue = computed(() => state.queue?.queueKey === props.release.slug);
const activeIndex = computed(() => (isActiveQueue.value ? state.currentIndex : 0));
const activePosition = computed(() => (isActiveQueue.value ? state.currentTime : 0));
const activeDuration = computed(() => (isActiveQueue.value ? state.duration : 0));

const progress = computed(() => {
  if (!activeDuration.value) return 0;
  return Math.max(0, Math.min(100, (activePosition.value / activeDuration.value) * 100));
});

const releaseDownloadFormats = computed<DownloadFormat[]>(() => props.release.availableDownloadFormats as DownloadFormat[]);
const trackDownloadFormats = computed<DownloadFormat[]>(() => {
  const track = props.release.tracks[activeIndex.value];
  return ((track?.availableDownloadFormats ?? []) as DownloadFormat[]);
});

const downloadFormat = ref<DownloadFormat>((props.release.availableDownloadFormats[0] as DownloadFormat) || "ogg");
const isDownloading = ref(false);
const downloadError = ref<string | null>(null);
const isTrackDownloading = ref(false);

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseDownloadFileName(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) return fallbackName;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const simpleMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (simpleMatch?.[1]) return simpleMatch[1];

  return fallbackName;
}

function getApiError(payload: { error?: string; message?: string } | null, fallback: string): string {
  if (payload?.error && payload.error.trim().length > 0) return payload.error;
  if (payload?.message && payload.message.trim().length > 0) return payload.message;
  return fallback;
}

function isLikelyIOSDevice(): boolean {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function toggleMainPlayPause() {
  if (queuePayload.value.tracks.length === 0) return;

  if (!isActiveQueue.value) {
    setQueue(queuePayload.value);
    playTrack(0);
    return;
  }

  togglePlayPause();
}

function playTrackFromList(index: number) {
  if (!queuePayload.value.tracks[index]) return;

  if (!isActiveQueue.value) {
    setQueue(queuePayload.value);
    playTrack(index);
    return;
  }

  if (index === state.currentIndex) {
    togglePlayPause();
    return;
  }

  playTrack(index);
}

function seekByClick(event: MouseEvent) {
  if (!isActiveQueue.value || !activeDuration.value) return;

  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  seekByRatio(ratio);
}

async function handleDownload() {
  if (!releaseDownloadFormats.value.includes(downloadFormat.value)) {
    downloadError.value = isRu.value ? "Этот формат недоступен для релиза" : "Format is not available for this release";
    return;
  }

  if (isDownloading.value) return;

  downloadError.value = null;
  isDownloading.value = true;

  try {
    const directDownloadUrl = `/api/releases/download?slug=${encodeURIComponent(props.release.slug)}&format=${encodeURIComponent(downloadFormat.value)}`;

    if (isLikelyIOSDevice()) {
      window.location.assign(directDownloadUrl);
      return;
    }

    const response = await fetch(directDownloadUrl, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      throw new Error(getApiError(payload, "Download failed"));
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = parseDownloadFileName(
      response.headers.get("content-disposition"),
      `${props.release.slug}-${downloadFormat.value}.zip`
    );

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : "Unexpected download error";
  } finally {
    isDownloading.value = false;
  }
}

async function handleTrackDownload() {
  const track = props.release.tracks[activeIndex.value];
  if (!track) return;

  if (!trackDownloadFormats.value.includes(downloadFormat.value)) {
    downloadError.value = isRu.value ? "Этот формат недоступен для трека" : "Format is not available for this track";
    return;
  }

  isTrackDownloading.value = true;
  downloadError.value = null;

  try {
    const response = await fetch(
      `/api/releases/track?slug=${encodeURIComponent(props.release.slug)}&track=${encodeURIComponent(String(track.index))}&format=${encodeURIComponent(downloadFormat.value)}`,
      {
        method: "GET",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      throw new Error(getApiError(payload, "Track download failed"));
    }

    if (isLikelyIOSDevice()) {
      window.location.assign(
        `/api/releases/track?slug=${encodeURIComponent(props.release.slug)}&track=${encodeURIComponent(String(track.index))}&format=${encodeURIComponent(downloadFormat.value)}`
      );
      return;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = parseDownloadFileName(
      response.headers.get("content-disposition"),
      `${props.release.slug}-${track.index}.${downloadFormat.value}`
    );

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : "Unexpected track download error";
  } finally {
    isTrackDownloading.value = false;
  }
}

</script>

<template>
  <section class="release-player" :aria-label="`${release.albumName} player`">
    <div v-if="isDownloading" class="release-download-modal" role="status" aria-live="polite">
      <div class="release-download-modal-card">
        <div class="release-download-spinner" />
        <p>{{ isRu ? "Готовим ZIP..." : "Preparing ZIP..." }}</p>
      </div>
    </div>

    <div class="release-player-top">
      <img
        :src="release.coverPreviewUrl || release.coverUrl"
        :alt="`${release.albumName} cover`"
        class="release-player-cover-large"
        width="154"
        height="154"
        loading="eager"
        decoding="async"
        fetchpriority="high"
      />

      <div class="release-player-main">
        <header class="release-player-head">
          <button
            type="button"
            class="release-player-main-btn"
            :aria-label="state.playing && isActiveQueue ? 'Pause' : 'Play'"
            @click="toggleMainPlayPause"
          >
            <Pause v-if="state.playing && isActiveQueue" class="release-player-main-icon" aria-hidden="true" />
            <Play v-else class="release-player-main-icon release-player-main-icon-play" aria-hidden="true" />
          </button>

          <div class="release-player-meta">
            <div class="release-player-artist">D7TUN6</div>
            <div class="release-player-album">{{ release.albumName }}</div>
          </div>

          <div class="release-player-side">
            <div class="release-player-date">{{ release.releaseDate }}</div>
            <div class="release-player-genre">#{{ isRu ? release.genre.ru : release.genre.en }}</div>
          </div>
        </header>

        <div class="release-player-timeline-wrap">
          <div class="release-player-time">{{ fmtTime(activePosition) }}</div>
          <div
            class="release-player-timeline"
            role="slider"
            :aria-valuemin="0"
            :aria-valuemax="Math.max(activeDuration, 1)"
            :aria-valuenow="activePosition"
            @click="seekByClick"
          >
            <div class="release-player-timeline-fill" :style="{ width: `${progress}%` }" />
          </div>
          <div class="release-player-time">{{ fmtTime(activeDuration) }}</div>
        </div>

        <div class="release-player-content">
          <ul class="release-player-list">
            <li
              v-for="(track, index) in release.tracks"
              :key="`${track.url}-${index}`"
              :class="isActiveQueue && index === activeIndex ? 'is-active' : undefined"
            >
              <button type="button" class="release-player-track" @click="playTrackFromList(index)">
                <span class="release-player-thumb-wrap">
                  <img
                    :src="release.coverPreviewUrl || release.coverUrl"
                    alt=""
                    class="release-player-thumb"
                    width="28"
                    height="28"
                    loading="lazy"
                    decoding="async"
                  />
                  <span
                    class="release-player-thumb-overlay"
                    :title="isActiveQueue && index === activeIndex && state.playing ? 'Pause' : 'Play'"
                  >
                    <span
                      :class="isActiveQueue && index === activeIndex && state.playing ? 'release-player-icon-pause' : 'release-player-icon-play'"
                    />
                  </span>
                </span>
                <span class="release-player-track-name">{{ index + 1 }}. {{ track.title }}</span>
              </button>
            </li>
          </ul>

          <aside class="release-download-panel" aria-label="Release download">
            <h4>{{ isRu ? "Скачать релиз" : "Download Release" }}</h4>
            <p>{{ isRu ? "Выбери формат:" : "Choose format:" }}</p>
            <select v-model="downloadFormat">
              <option v-for="format in releaseDownloadFormats" :key="format" :value="format">
                {{
                  format === "flac"
                    ? "FLAC 16-bit / 44.1kHz"
                    : format === "mp3"
                      ? "MP3 320 kbps / 44.1kHz"
                      : format === "wav"
                        ? "WAV PCM 16-bit / 44.1kHz"
                        : "Ogg Opus VBR / 48kHz"
                }}
              </option>
            </select>
            <button type="button" class="release-download-btn" :disabled="isDownloading" @click="handleDownload">
              {{ isRu ? "Скачать ZIP" : "Download ZIP" }}
            </button>
            <button
              type="button"
              class="release-download-btn release-download-btn-secondary"
              :disabled="isTrackDownloading || !trackDownloadFormats.includes(downloadFormat)"
              @click="handleTrackDownload"
            >
              {{ isRu ? "Скачать трек" : "Download Track" }}
            </button>
            <small v-if="downloadError">{{ downloadError }}</small>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>
