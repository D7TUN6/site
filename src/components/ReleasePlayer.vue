<script setup lang="ts">
import { computed, ref } from "vue";
import { Pause, Play } from "lucide-vue-next";
import UiSelect from "@/components/UiSelect.vue";
import { usePlayer } from "@/composables/usePlayer";
import { useReleaseDownloads } from "@/composables/useReleaseDownloads";
import { buildPlayerQueueFromRelease, type GlobalPlayerQueue } from "@/player/queue";
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

const {
  isDownloading,
  isTrackDownloading,
  downloadError,
  setDownloadError,
  downloadRelease,
  downloadTrack
} = useReleaseDownloads(props.release);

const queuePayload = computed<GlobalPlayerQueue>(() => buildPlayerQueueFromRelease(props.release, props.lang));

const isRu = computed(() => props.lang === "ru");
const isActiveQueue = computed(() => state.queue?.queueKey === props.release.slug);
const activeIndex = computed(() => (isActiveQueue.value ? state.currentIndex : 0));
const activePosition = computed(() => (isActiveQueue.value ? state.currentTime : 0));
const activeDuration = computed(() => (isActiveQueue.value ? state.duration : 0));

const progress = computed(() => {
  if (!activeDuration.value) return 0;
  return Math.max(0, Math.min(100, (activePosition.value / activeDuration.value) * 100));
});

const buffered = computed(() => {
  if (!isActiveQueue.value || !activeDuration.value) return 0;
  const value = (state.bufferedTime / activeDuration.value) * 100;
  return Math.max(0, Math.min(100, value));
});

const seekDragRatio = ref<number | null>(null);
const displayProgress = computed(() => {
  if (seekDragRatio.value == null) return progress.value;
  return Math.max(0, Math.min(100, seekDragRatio.value * 100));
});

const displayPosition = computed(() => {
  if (seekDragRatio.value == null) return fmtTime(activePosition.value);
  return fmtTime(activeDuration.value * seekDragRatio.value);
});

const releaseDownloadFormats = computed<DownloadFormat[]>(() => props.release.availableDownloadFormats as DownloadFormat[]);
const trackDownloadFormats = computed<DownloadFormat[]>(() => {
  const track = props.release.tracks[activeIndex.value];
  return ((track?.availableDownloadFormats ?? []) as DownloadFormat[]);
});

const downloadFormat = ref<DownloadFormat>((props.release.availableDownloadFormats[0] as DownloadFormat) || "ogg");

function formatLabel(format: DownloadFormat): string {
  switch (format) {
    case "flac":
      return "FLAC 16-bit / 44.1kHz";
    case "mp3":
      return "MP3 320 kbps / 44.1kHz";
    case "wav":
      return "WAV PCM 16-bit / 44.1kHz";
    default:
      return "Ogg Opus VBR / 48kHz";
  }
}

const downloadFormatOptions = computed(() => {
  return releaseDownloadFormats.value.map((format) => ({
    value: format,
    label: formatLabel(format)
  }));
});

function setDownloadFormat(value: string) {
  downloadFormat.value = value as DownloadFormat;
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ratioFromPointer(event: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return (event.clientX - rect.left) / rect.width;
}

function onTimelinePointerDown(event: PointerEvent) {
  if (!isActiveQueue.value || !activeDuration.value) return;
  if (typeof event.button === "number" && event.button !== 0) return;

  const target = event.currentTarget as HTMLElement;
  try {
    target.setPointerCapture(event.pointerId);
  } catch {
    // ignore
  }

  const ratio = clamp01(ratioFromPointer(event, target));
  seekDragRatio.value = ratio;
  seekByRatio(ratio);
}

function onTimelinePointerMove(event: PointerEvent) {
  if (seekDragRatio.value == null) return;
  const target = event.currentTarget as HTMLElement;
  const ratio = clamp01(ratioFromPointer(event, target));
  seekDragRatio.value = ratio;
  seekByRatio(ratio);
}

function onTimelinePointerUp(event: PointerEvent) {
  if (seekDragRatio.value == null) return;
  const target = event.currentTarget as HTMLElement;
  try {
    target.releasePointerCapture(event.pointerId);
  } catch {
    // ignore
  }
  seekDragRatio.value = null;
}

async function handleDownload() {
  if (!releaseDownloadFormats.value.includes(downloadFormat.value)) {
    setDownloadError(isRu.value ? "Этот формат недоступен для релиза" : "Format is not available for this release");
    return;
  }
  await downloadRelease(downloadFormat.value);
}

async function handleTrackDownload() {
  const track = props.release.tracks[activeIndex.value];
  if (!track) return;

  if (!trackDownloadFormats.value.includes(downloadFormat.value)) {
    setDownloadError(isRu.value ? "Этот формат недоступен для трека" : "Format is not available for this track");
    return;
  }
  await downloadTrack(track.index, downloadFormat.value);
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
          <div class="release-player-time">{{ displayPosition }}</div>
          <div
            class="release-player-timeline"
            role="slider"
            :class="{ 'is-dragging': seekDragRatio !== null }"
            :aria-valuemin="0"
            :aria-valuemax="Math.max(activeDuration, 1)"
            :aria-valuenow="seekDragRatio == null ? activePosition : activeDuration * seekDragRatio"
            @pointerdown.prevent="onTimelinePointerDown"
            @pointermove.prevent="onTimelinePointerMove"
            @pointerup.prevent="onTimelinePointerUp"
            @pointercancel.prevent="onTimelinePointerUp"
          >
            <div class="release-player-timeline-buffer" :style="{ width: `${buffered}%` }" />
            <div class="release-player-timeline-fill" :style="{ width: `${displayProgress}%` }" />
            <div class="release-player-timeline-knob" :style="{ left: `${displayProgress}%` }" />
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
            <UiSelect
              :model-value="downloadFormat"
              :options="downloadFormatOptions"
              :aria-label="isRu ? 'формат скачивания' : 'download format'"
              @update:model-value="setDownloadFormat"
            />
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
