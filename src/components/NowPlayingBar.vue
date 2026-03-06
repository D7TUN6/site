<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePlayer } from "@/composables/usePlayer";

const props = defineProps<{
  isMusicRoute: boolean;
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
  playTrack
} = usePlayer();

const nextUpOpen = ref(false);
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

watch(
  shouldShow,
  (value) => {
    document.body.classList.toggle("has-now-playing-bar", value);
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener("mousedown", onPointerDown);
});

onBeforeUnmount(() => {
  document.body.classList.remove("has-now-playing-bar");
  window.removeEventListener("mousedown", onPointerDown);
});
</script>

<template>
  <template v-if="shouldShow && state.queue && currentTrack">
    <div v-if="nextUpOpen" ref="panelRef" class="now-playing-nextup" role="dialog" aria-label="Next up">
      <div class="now-playing-nextup-head">
        <h4>Next up</h4>
        <button type="button" @click="nextUpOpen = false" aria-label="Close next up">✕</button>
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

    <div class="now-playing-bar" role="region" aria-label="Now playing">
      <div class="now-playing-controls">
        <button type="button" class="now-playing-btn" aria-label="Previous track" @click="prevTrack">
          <svg class="now-playing-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 5h2v14H6zM18 5v14l-8-7z" />
          </svg>
        </button>
        <button
          type="button"
          class="now-playing-btn now-playing-btn-main"
          :aria-label="state.playing ? 'Pause' : 'Play'"
          @click="togglePlayPause"
        >
          <svg v-if="state.playing" class="now-playing-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
          <svg v-else class="now-playing-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button type="button" class="now-playing-btn" aria-label="Next track" @click="nextTrack">
          <svg class="now-playing-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 5h2v14h-2zM6 5l8 7-8 7z" />
          </svg>
        </button>
        <button
          type="button"
          :class="`now-playing-btn now-playing-btn-small${state.shuffleEnabled ? ' is-active' : ''}`"
          aria-label="Shuffle"
          @click="toggleShuffle"
        >
          <svg class="now-playing-icon now-playing-icon-stroke" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 7h4l10 10h4" />
            <path d="m19 15 2 2-2 2" />
            <path d="M3 17h4l3.5-3.5" />
            <path d="M17 7h4" />
            <path d="m19 5 2 2-2 2" />
          </svg>
        </button>
        <button
          type="button"
          :class="`now-playing-btn now-playing-btn-small${state.repeatMode !== 'off' ? ' is-active' : ''}`"
          aria-label="Repeat"
          @click="cycleRepeatMode"
        >
          <span class="now-playing-icon-wrap">
            <svg class="now-playing-icon now-playing-icon-stroke" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8h13" />
              <path d="m14 5 3 3-3 3" />
              <path d="M20 16H7" />
              <path d="m10 13-3 3 3 3" />
            </svg>
            <span v-if="state.repeatMode === 'one'" class="now-playing-repeat-one">1</span>
          </span>
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
            <svg
              v-if="state.muted || state.volume <= 0"
              class="now-playing-icon now-playing-icon-stroke"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M3 10h4l5-4v12l-5-4H3z" />
              <path d="M16 9l5 6" />
              <path d="M21 9l-5 6" />
            </svg>
            <svg v-else class="now-playing-icon now-playing-icon-stroke" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 10h4l5-4v12l-5-4H3z" />
              <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />
              <path d="M18.5 7a7 7 0 0 1 0 10" />
            </svg>
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
          <svg class="now-playing-icon now-playing-icon-stroke" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14" />
            <path d="M5 12h14" />
            <path d="M5 17h14" />
          </svg>
        </button>
      </div>
    </div>
  </template>
</template>
