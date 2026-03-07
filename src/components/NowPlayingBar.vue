<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X
} from "lucide-vue-next";
import { usePlayer } from "@/composables/usePlayer";

const props = defineProps<{
  isMusicRoute: boolean;
  lang: "en" | "ru";
}>();

const {
  state,
  currentTrack,
  upcomingTracks,
  togglePlayPause,
  nextTrack,
  prevTrack,
  seekByRatio,
  setVolume,
  toggleMute,
  toggleShuffle,
  cycleRepeatMode,
  playTrack,
  clearPlayer
} = usePlayer();

const nextUpOpen = ref(false);
const fullscreenOpen = ref(false);
const panelRef = ref<HTMLDivElement | null>(null);
const nextUpButtonRef = ref<HTMLButtonElement | null>(null);

const shouldShow = computed(() => {
  return Boolean(state.queue && currentTrack.value && (props.isMusicRoute || state.hasStartedPlayback));
});

const progress = computed(() => {
  if (state.duration <= 0) return 0;
  return Math.max(0, Math.min(100, (state.currentTime / state.duration) * 100));
});

const volumeSlider = computed({
  get: () => (state.muted ? 0 : state.volume),
  set: (value: number) => {
    if (!Number.isFinite(value)) return;
    setVolume(value);
  }
});

const currentQueueTracks = computed(() => state.queue?.tracks ?? []);
const repeatLabel = computed(() => {
  if (state.repeatMode === "one") return "Repeat One";
  if (state.repeatMode === "all") return "Repeat All";
  return "Repeat Off";
});

function fmtTime(seconds: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function seekFromClick(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0) return;

  const ratio = (event.clientX - rect.left) / rect.width;
  seekByRatio(ratio);
}

function onPointerDown(event: MouseEvent) {
  if (!nextUpOpen.value) return;

  const node = event.target as Node | null;
  if (!node) return;

  if (panelRef.value?.contains(node)) return;
  if (nextUpButtonRef.value?.contains(node)) return;

  nextUpOpen.value = false;
}

function onBarClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (
    target.closest(
      "button, input, a, .now-playing-progress, .now-playing-progress-wrap, .now-playing-volume-box, .now-playing-nextup"
    )
  ) {
    return;
  }
  fullscreenOpen.value = true;
}

watch(
  shouldShow,
  (value) => {
    document.body.classList.toggle("has-now-playing-bar", value);
    if (!value) {
      fullscreenOpen.value = false;
      nextUpOpen.value = false;
    }
  },
  { immediate: true }
);

watch(
  fullscreenOpen,
  (value) => {
    document.body.classList.toggle("has-now-playing-fullscreen", value);
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener("mousedown", onPointerDown);
});

onBeforeUnmount(() => {
  document.body.classList.remove("has-now-playing-bar");
  document.body.classList.remove("has-now-playing-fullscreen");
  window.removeEventListener("mousedown", onPointerDown);
});
</script>

<template>
  <template v-if="shouldShow && state.queue && currentTrack">
    <div v-if="nextUpOpen" ref="panelRef" class="now-playing-nextup" role="dialog" aria-label="Next up">
      <div class="now-playing-nextup-head">
        <h4>Next up</h4>
        <button type="button" @click="nextUpOpen = false" aria-label="Close next up">
          <X class="now-playing-icon" aria-hidden="true" />
        </button>
      </div>

      <p v-if="upcomingTracks.length === 0" class="now-playing-nextup-empty">Queue is empty.</p>

      <ul v-else>
        <li v-for="item in upcomingTracks" :key="`${item.track.url}-${item.index}`">
          <button type="button" @click="playTrack(item.index)">
            <img :src="state.queue.coverUrl" alt="" width="36" height="36" />
            <div>
              <span>{{ state.queue.artist }}</span>
              <strong>{{ item.track.title }}</strong>
            </div>
            <time>{{ fmtTime(item.duration) }}</time>
          </button>
        </li>
      </ul>
    </div>

    <div
      v-if="fullscreenOpen"
      class="now-playing-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing fullscreen"
    >
      <button
        type="button"
        class="now-playing-fullscreen-close"
        aria-label="Close fullscreen player"
        @click="fullscreenOpen = false"
      >
        <X class="now-playing-icon" aria-hidden="true" />
      </button>

      <div class="now-playing-fullscreen-shell">
        <section class="now-playing-fullscreen-hero">
          <div class="now-playing-fullscreen-art-card">
            <div class="now-playing-fullscreen-art">
              <img :src="state.queue.coverUrl" :alt="`${state.queue.albumTitle} cover`" />
            </div>

            <div class="now-playing-fullscreen-meta">
              <div class="now-playing-fullscreen-artist">{{ state.queue.artist }}</div>
              <h2>{{ currentTrack.title }}</h2>
              <p>{{ state.queue.albumTitle }}</p>
            </div>
          </div>

          <div class="now-playing-fullscreen-links-card">
            <div class="now-playing-fullscreen-links">
              <a
                v-if="currentTrack.links?.spotify"
                class="stream-badge-image-link"
                :href="currentTrack.links.spotify"
                target="_blank"
                rel="noreferrer"
              >
                <img class="stream-badge-image" src="/media/image/spotify-badge.png" alt="Spotify" />
              </a>
              <a
                v-if="currentTrack.links?.yandexMusic"
                class="stream-badge-image-link"
                :href="currentTrack.links.yandexMusic"
                target="_blank"
                rel="noreferrer"
              >
                <img class="stream-badge-image" src="/media/image/yandex-badge.png" alt="Yandex Music" />
              </a>
              <a
                v-if="currentTrack.links?.bandcamp"
                class="stream-badge-image-link"
                :href="currentTrack.links.bandcamp"
                target="_blank"
                rel="noreferrer"
              >
                <img class="stream-badge-image" src="/media/image/bandcamp-badge.png" alt="Bandcamp" />
              </a>
              <a
                v-if="currentTrack.links?.soundcloud"
                class="stream-badge-image-link"
                :href="currentTrack.links.soundcloud"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  class="stream-badge-image stream-badge-image-soundcloud"
                  src="/media/image/soundcloud-badge.webp"
                  alt="SoundCloud"
                />
              </a>
            </div>
          </div>
        </section>

        <section class="now-playing-fullscreen-panel">
          <div class="now-playing-fullscreen-toolbar">
            <div class="now-playing-fullscreen-modes">
              <button
                type="button"
                :class="`now-playing-btn now-playing-btn-small${state.shuffleEnabled ? ' is-active' : ''}`"
                aria-label="Shuffle"
                @click="toggleShuffle"
              >
                <Shuffle class="now-playing-icon" aria-hidden="true" />
              </button>
              <button
                type="button"
                :class="`now-playing-btn now-playing-btn-small${state.repeatMode !== 'off' ? ' is-active' : ''}`"
                :aria-label="repeatLabel"
                @click="cycleRepeatMode"
              >
                <Repeat1 v-if="state.repeatMode === 'one'" class="now-playing-icon" aria-hidden="true" />
                <Repeat v-else class="now-playing-icon" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div class="now-playing-fullscreen-playback">
            <div class="now-playing-fullscreen-progress">
              <div class="now-playing-time">{{ fmtTime(state.currentTime) }}</div>
              <div
                class="now-playing-progress"
                role="slider"
                :aria-valuemin="0"
                :aria-valuemax="Math.max(state.duration, 1)"
                :aria-valuenow="state.currentTime"
                aria-label="Playback position"
                @click="seekFromClick"
              >
                <span class="now-playing-progress-fill" :style="{ width: `${progress}%` }" />
              </div>
              <div class="now-playing-time">{{ fmtTime(state.duration) }}</div>
            </div>

            <div class="now-playing-fullscreen-controls">
              <button type="button" class="now-playing-btn" aria-label="Previous track" @click="prevTrack">
                <SkipBack class="now-playing-icon" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="now-playing-btn now-playing-btn-main"
                :aria-label="state.playing ? 'Pause' : 'Play'"
                @click="togglePlayPause"
              >
                <Pause v-if="state.playing" class="now-playing-icon now-playing-icon-pause" aria-hidden="true" />
                <Play v-else class="now-playing-icon now-playing-icon-play" aria-hidden="true" />
              </button>
              <button type="button" class="now-playing-btn" aria-label="Next track" @click="nextTrack">
                <SkipForward class="now-playing-icon" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div class="now-playing-fullscreen-tracklist">
            <div class="now-playing-fullscreen-tracklist-head">Tracklist</div>
            <ul>
              <li
                v-for="(track, index) in currentQueueTracks"
                :key="`${track.url}-${index}`"
                :class="{ 'is-active': index === state.currentIndex }"
              >
                <button type="button" @click="playTrack(index)">
                  <span class="now-playing-fullscreen-track-index">{{ index + 1 }}</span>
                  <span class="now-playing-fullscreen-track-title">{{ track.title }}</span>
                  <span class="now-playing-fullscreen-track-time">{{ fmtTime(track.duration ?? null) }}</span>
                </button>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

    <div class="now-playing-bar" role="region" aria-label="Now playing" @click="onBarClick">
      <div class="now-playing-controls">
        <button type="button" class="now-playing-btn" aria-label="Previous track" @click="prevTrack">
          <SkipBack class="now-playing-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="now-playing-btn now-playing-btn-main"
          :aria-label="state.playing ? 'Pause' : 'Play'"
          @click="togglePlayPause"
        >
          <Pause v-if="state.playing" class="now-playing-icon now-playing-icon-pause" aria-hidden="true" />
          <Play v-else class="now-playing-icon now-playing-icon-play" aria-hidden="true" />
        </button>
        <button type="button" class="now-playing-btn" aria-label="Next track" @click="nextTrack">
          <SkipForward class="now-playing-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          :class="`now-playing-btn now-playing-btn-small${state.shuffleEnabled ? ' is-active' : ''}`"
          aria-label="Shuffle"
          @click="toggleShuffle"
        >
          <Shuffle class="now-playing-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          :class="`now-playing-btn now-playing-btn-small${state.repeatMode !== 'off' ? ' is-active' : ''}`"
          aria-label="Repeat"
          @click="cycleRepeatMode"
        >
          <Repeat1 v-if="state.repeatMode === 'one'" class="now-playing-icon" aria-hidden="true" />
          <Repeat v-else class="now-playing-icon" aria-hidden="true" />
        </button>
      </div>

      <div class="now-playing-progress-wrap">
        <div class="now-playing-time">{{ fmtTime(state.currentTime) }}</div>
        <div
          class="now-playing-progress"
          role="slider"
          :aria-valuemin="0"
          :aria-valuemax="Math.max(state.duration, 1)"
          :aria-valuenow="state.currentTime"
          aria-label="Playback position"
          @click="seekFromClick"
        >
          <span class="now-playing-progress-fill" :style="{ width: `${progress}%` }" />
        </div>
        <div class="now-playing-time">{{ fmtTime(state.duration) }}</div>
      </div>

      <div class="now-playing-right">
        <div class="now-playing-volume-box">
          <button
            type="button"
            :class="`now-playing-btn now-playing-btn-small${state.muted || state.volume <= 0 ? ' is-muted' : ''}`"
            :aria-label="state.muted || state.volume <= 0 ? 'Unmute' : 'Mute'"
            @click="toggleMute"
          >
            <VolumeX v-if="state.muted || state.volume <= 0" class="now-playing-icon" aria-hidden="true" />
            <Volume2 v-else class="now-playing-icon" aria-hidden="true" />
          </button>

          <div class="now-playing-volume-popup">
            <input
              class="now-playing-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              v-model.number="volumeSlider"
              aria-label="Volume"
            />
          </div>
        </div>

        <img
          :src="state.queue.coverUrl"
          alt=""
          class="now-playing-cover"
          width="44"
          height="44"
          loading="lazy"
          decoding="async"
        />

        <div class="now-playing-meta">
          <div class="now-playing-artist">{{ state.queue.artist }}</div>
          <div class="now-playing-title" :title="currentTrack.title">{{ currentTrack.title }}</div>
        </div>

        <button
          ref="nextUpButtonRef"
          type="button"
          :class="`now-playing-btn now-playing-btn-small${nextUpOpen ? ' is-active' : ''}`"
          aria-label="Next up"
          @click="nextUpOpen = !nextUpOpen"
        >
          <ListMusic class="now-playing-icon" aria-hidden="true" />
        </button>
        <button type="button" class="now-playing-btn now-playing-btn-small" aria-label="Close player" @click="clearPlayer">
          <X class="now-playing-icon" aria-hidden="true" />
        </button>
      </div>
    </div>
  </template>
</template>
