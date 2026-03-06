<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { usePlayer, type GlobalPlayerQueue } from "@/composables/usePlayer";
import type { ReleaseEntry } from "@/types/content";

type DownloadFormat = "flac" | "mp3" | "ogg" | "wav";

type DownloadJobPayload = {
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  message: string;
  error: string | null;
};

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
    url: track.url
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

const downloadFormat = ref<DownloadFormat>("flac");
const isDownloading = ref(false);
const downloadProgress = ref(0);
const downloadMessage = ref("");
const downloadError = ref<string | null>(null);
let downloadAbort = false;

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getApiError(payload: { error?: string; message?: string } | null, fallback: string): string {
  if (payload?.error && payload.error.trim().length > 0) return payload.error;
  if (payload?.message && payload.message.trim().length > 0) return payload.message;
  return fallback;
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
  if (isDownloading.value) return;

  downloadAbort = false;
  downloadError.value = null;
  downloadProgress.value = 0;
  downloadMessage.value = "Queued";
  isDownloading.value = true;

  try {
    const response = await fetch("/api/releases/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        slug: props.release.slug,
        format: downloadFormat.value
      })
    });

    const payload = (await response.json().catch(() => null)) as
      | (Partial<DownloadJobPayload> & { error?: string })
      | null;

    if (!response.ok) {
      throw new Error(getApiError(payload, "Download failed"));
    }

    if (!payload?.jobId) {
      throw new Error("Queue response is invalid");
    }

    const jobId = payload.jobId;
    downloadProgress.value = Math.max(0, Math.min(100, Number(payload.progress) || 0));
    downloadMessage.value = payload.message || "Preparing conversion";

    while (!downloadAbort) {
      const jobRes = await fetch(`/api/releases/download?jobId=${encodeURIComponent(jobId)}`, {
        method: "GET",
        cache: "no-store"
      });

      const jobPayload = (await jobRes.json().catch(() => null)) as
        | (Partial<DownloadJobPayload> & { error?: string })
        | null;

      if (!jobRes.ok) {
        const message = getApiError(jobPayload, "Queue temporary error");

        if (jobRes.status === 429 || jobRes.status >= 500) {
          downloadMessage.value = isRu.value ? "Очередь занята, повтор..." : "Queue busy, retrying...";
          await wait(2200);
          continue;
        }

        throw new Error(message);
      }

      const status = jobPayload?.status;
      const nextProgress = Math.max(0, Math.min(100, Number(jobPayload?.progress) || 0));
      const nextMessage = jobPayload?.message || "Converting";

      downloadProgress.value = nextProgress;
      downloadMessage.value = nextMessage;

      if (status === "failed") {
        throw new Error(jobPayload?.error || "Conversion failed");
      }

      if (status === "done") {
        break;
      }

      await wait(1200);
    }

    if (downloadAbort) return;

    downloadProgress.value = 100;
    downloadMessage.value = "Downloading ZIP";

    let downloadRes: Response | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      downloadRes = await fetch(`/api/releases/download?jobId=${encodeURIComponent(jobId)}&download=1`, {
        method: "GET",
        cache: "no-store"
      });

      if (downloadRes.ok) break;

      const failPayload = (await downloadRes.json().catch(() => null)) as { error?: string; message?: string } | null;
      const failMessage = getApiError(failPayload, "Unable to download archive");
      const isRetryable =
        downloadRes.status === 409 || downloadRes.status === 429 || downloadRes.status >= 500;

      if (isRetryable && attempt < 7) {
        downloadMessage.value = isRu.value ? "Готовим архив..." : "Finalizing archive...";
        await wait(900);
        continue;
      }

      throw new Error(failMessage);
    }

    if (!downloadRes || !downloadRes.ok) {
      throw new Error("Unable to download archive");
    }

    const blob = await downloadRes.blob();
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = parseDownloadFileName(
      downloadRes.headers.get("content-disposition"),
      `${props.release.slug}-${downloadFormat.value}.zip`
    );

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : "Unexpected download error";
  } finally {
    downloadAbort = true;
    isDownloading.value = false;
    downloadProgress.value = 0;
    downloadMessage.value = "";
  }
}

onBeforeUnmount(() => {
  downloadAbort = true;
});
</script>

<template>
  <section class="release-player" :aria-label="`${release.albumName} player`">
    <div v-if="isDownloading" class="release-download-modal" role="status" aria-live="polite">
      <div class="release-download-modal-card">
        <div class="release-download-spinner" />
        <p>{{ downloadMessage || "Preparing download" }}</p>
        <div class="release-download-modal-progress">
          <span :style="{ width: `${downloadProgress}%` }" />
        </div>
        <small>{{ downloadProgress }}%</small>
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
            {{ state.playing && isActiveQueue ? "❚❚" : "▶" }}
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
              <option value="flac">FLAC 16-bit / 44.1kHz</option>
              <option value="mp3">MP3 320 kbps / 44.1kHz</option>
              <option value="ogg">Ogg Opus VBR / 48kHz</option>
              <option value="wav">WAV PCM 16-bit / 44.1kHz</option>
            </select>
            <button type="button" class="release-download-btn" :disabled="isDownloading" @click="handleDownload">
              {{ isRu ? "Скачать ZIP" : "Download ZIP" }}
            </button>
            <small v-if="downloadError">{{ downloadError }}</small>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>
