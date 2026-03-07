import Hls from "hls.js";
import { computed, reactive, readonly, watch } from "vue";
import { getReleaseBySlug } from "@/lib/releaseManifest";

export type GlobalPlayerTrack = {
  title: string;
  url: string;
  streamUrl?: string | null;
  fallbackUrl?: string | null;
  duration?: number | null;
  links?: {
    spotify: string | null;
    yandexMusic: string | null;
    bandcamp: string | null;
    soundcloud: string | null;
  };
};

export type GlobalPlayerQueue = {
  queueKey: string;
  albumSlug: string;
  albumTitle: string;
  artist: string;
  coverUrl: string;
  releaseDate: string;
  genre: string;
  tracks: GlobalPlayerTrack[];
};

export type RepeatMode = "off" | "all" | "one";

export type UpcomingTrack = {
  index: number;
  track: GlobalPlayerTrack;
  duration: number | null;
};

type PersistedPlayerState = {
  queueKey: string;
  currentIndex: number;
  currentTime: number;
  volume: number;
  muted: boolean;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  hasStartedPlayback: boolean;
  playOrder: number[];
  orderPos: number;
  wasPlaying: boolean;
};

const PLAYER_STORAGE_KEY = "site-player-state";

const state = reactive({
  queue: null as GlobalPlayerQueue | null,
  currentIndex: 0,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  shuffleEnabled: false,
  repeatMode: "off" as RepeatMode,
  hasStartedPlayback: false,
  playOrder: [] as number[],
  orderPos: 0,
  trackDurations: {} as Record<string, number>
});

const audio = new Audio();
audio.preload = "metadata";
const supportsOggOpus = audio.canPlayType('audio/ogg; codecs="opus"') !== "";
const supportsNativeHls = audio.canPlayType("application/vnd.apple.mpegurl") !== "";
let hls: Hls | null = null;
let pendingAutoplay = false;
let playRequestInFlight = false;
let pendingRestoreTime: number | null = null;
let hasRestoredState = false;

let listenersAttached = false;

function persistState(): void {
  if (typeof window === "undefined") return;

  if (!state.queue) {
    window.localStorage.removeItem(PLAYER_STORAGE_KEY);
    return;
  }

  const payload: PersistedPlayerState = {
    queueKey: state.queue.queueKey,
    currentIndex: state.currentIndex,
    currentTime: Number.isFinite(state.currentTime) ? state.currentTime : 0,
    volume: state.volume,
    muted: state.muted,
    shuffleEnabled: state.shuffleEnabled,
    repeatMode: state.repeatMode,
    hasStartedPlayback: state.hasStartedPlayback,
    playOrder: [...state.playOrder],
    orderPos: state.orderPos,
    wasPlaying: state.playing
  };

  window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
}

function buildQueueFromReleaseSlug(slug: string): GlobalPlayerQueue | null {
  const release = getReleaseBySlug(slug);
  if (!release) return null;

  return {
    queueKey: release.slug,
    albumSlug: release.slug,
    albumTitle: release.albumName,
    artist: "D7TUN6",
    coverUrl: release.coverPreviewUrl || release.coverUrl,
    releaseDate: release.releaseDate,
    genre: release.genre.en,
    tracks: release.tracks.map((track) => ({
      title: track.title,
      url: track.url,
      streamUrl: track.streamUrl,
      fallbackUrl: track.sourceUrl,
      duration: track.duration,
      links: track.links
    }))
  };
}

function restorePersistedState(): void {
  if (typeof window === "undefined" || hasRestoredState) return;
  hasRestoredState = true;

  const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY);
  if (!raw) return;

  try {
    const persisted = JSON.parse(raw) as PersistedPlayerState;
    if (!persisted?.queueKey) return;

    const queue = buildQueueFromReleaseSlug(persisted.queueKey);
    if (!queue || queue.tracks.length === 0) return;

    state.queue = queue;
    state.currentIndex = clamp(persisted.currentIndex ?? 0, 0, Math.max(queue.tracks.length - 1, 0));
    state.currentTime = Math.max(0, persisted.currentTime || 0);
    state.duration =
      typeof queue.tracks[state.currentIndex]?.duration === "number" ? (queue.tracks[state.currentIndex]?.duration as number) : 0;
    state.volume = clamp(persisted.volume ?? 1, 0, 1);
    state.muted = Boolean(persisted.muted);
    state.shuffleEnabled = Boolean(persisted.shuffleEnabled);
    state.repeatMode =
      persisted.repeatMode === "all" || persisted.repeatMode === "one" ? persisted.repeatMode : "off";
    state.hasStartedPlayback = Boolean(persisted.hasStartedPlayback);

    const validOrder =
      Array.isArray(persisted.playOrder) &&
      persisted.playOrder.length === queue.tracks.length &&
      persisted.playOrder.every((value) => Number.isInteger(value) && value >= 0 && value < queue.tracks.length);

    state.playOrder = validOrder
      ? [...persisted.playOrder]
      : state.shuffleEnabled
        ? buildShuffledOrder(queue.tracks.length, state.currentIndex)
        : buildSequentialOrder(queue.tracks.length);

    state.orderPos = clamp(
      validOrder ? persisted.orderPos ?? state.playOrder.indexOf(state.currentIndex) : state.playOrder.indexOf(state.currentIndex),
      0,
      Math.max(state.playOrder.length - 1, 0)
    );
    state.trackDurations = Object.fromEntries(
      queue.tracks
        .map((track) => [getTrackPlaybackUrl(track), track.duration])
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    );

    pendingRestoreTime = state.currentTime;
    attachTrackSource(queue.tracks[state.currentIndex], Boolean(persisted.wasPlaying));
  } catch {
    window.localStorage.removeItem(PLAYER_STORAGE_KEY);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildSequentialOrder(total: number): number[] {
  return Array.from({ length: total }, (_, index) => index);
}

function shuffleArray(values: number[]): number[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function buildShuffledOrder(total: number, firstIndex?: number): number[] {
  if (total <= 0) return [];

  if (typeof firstIndex === "number" && firstIndex >= 0 && firstIndex < total) {
    const rest = Array.from({ length: total }, (_, index) => index).filter((index) => index !== firstIndex);
    return [firstIndex, ...shuffleArray(rest)];
  }

  return shuffleArray(Array.from({ length: total }, (_, index) => index));
}

function syncOrderPosition(index: number): void {
  const activeQueue = state.queue;
  if (!activeQueue) return;

  if (!state.shuffleEnabled) {
    state.orderPos = index;
    return;
  }

  const existingPos = state.playOrder.indexOf(index);
  if (existingPos >= 0) {
    state.orderPos = existingPos;
    return;
  }

  state.playOrder = buildShuffledOrder(activeQueue.tracks.length, index);
  state.orderPos = 0;
}

function getTrackPlaybackUrl(track: GlobalPlayerTrack): string {
  if (track.streamUrl) {
    return track.streamUrl;
  }

  if (!supportsOggOpus && /\.ogg(?:$|[?#])/i.test(track.url) && track.fallbackUrl) {
    return track.fallbackUrl;
  }

  return track.url;
}

function destroyHls(): void {
  hls?.destroy();
  hls = null;
  pendingAutoplay = false;
  playRequestInFlight = false;
}

function canUseHlsJs(track: GlobalPlayerTrack): boolean {
  return Boolean(track.streamUrl && Hls.isSupported());
}

function canUseNativeHls(track: GlobalPlayerTrack): boolean {
  return Boolean(track.streamUrl && supportsNativeHls);
}

function flushPendingAutoplay(): void {
  if (!pendingAutoplay) return;

  pendingAutoplay = false;
  requestImmediatePlayback();
}

function requestImmediatePlayback(): void {
  if (playRequestInFlight) return;

  playRequestInFlight = true;
  void audio
    .play()
    .catch(() => {
      state.playing = false;
    })
    .finally(() => {
      playRequestInFlight = false;
    });
}

function attachTrackSource(track: GlobalPlayerTrack, autoplay: boolean): void {
  const playbackUrl = getTrackPlaybackUrl(track);
  const targetUrl = new URL(playbackUrl, window.location.origin).toString();
  pendingAutoplay = autoplay;

  if (track.streamUrl) {
    if (canUseHlsJs(track)) {
      destroyHls();
      hls = new Hls({
        startPosition: -1,
        enableWorker: true
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        flushPendingAutoplay();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          return;
        }

        destroyHls();
        if (track.fallbackUrl) {
          audio.src = track.fallbackUrl;
          audio.load();
          flushPendingAutoplay();
        }
      });

      if (audio.src) {
        audio.removeAttribute("src");
      }

      hls.attachMedia(audio);
      hls.loadSource(track.streamUrl);
      if (autoplay) {
        requestImmediatePlayback();
      }
      return;
    }

    if (canUseNativeHls(track)) {
      destroyHls();
      if (audio.src !== targetUrl) {
        audio.src = track.streamUrl;
        audio.load();
      }
      if (autoplay) {
        requestImmediatePlayback();
      }
      flushPendingAutoplay();
      return;
    }
  }

  destroyHls();
  if (audio.src !== targetUrl) {
    audio.src = playbackUrl;
    audio.load();
  }
  if (autoplay) {
    requestImmediatePlayback();
  }
  flushPendingAutoplay();
}

function loadTrack(index: number, autoplay: boolean): void {
  const activeQueue = state.queue;
  const track = activeQueue?.tracks[index];
  if (!activeQueue || !track) return;
  state.currentIndex = index;
  state.duration = typeof track.duration === "number" ? track.duration : 0;
  attachTrackSource(track, autoplay);

  syncOrderPosition(index);
}

function loadByOrderPos(targetOrderPos: number, autoplay: boolean): void {
  const targetIndex = state.playOrder[targetOrderPos];
  if (typeof targetIndex !== "number") return;

  state.orderPos = targetOrderPos;
  loadTrack(targetIndex, autoplay);
}

function generateWrappedOrder(anchorIndex?: number): number[] {
  const activeQueue = state.queue;
  if (!activeQueue) return [];

  if (!state.shuffleEnabled) {
    return buildSequentialOrder(activeQueue.tracks.length);
  }

  return buildShuffledOrder(activeQueue.tracks.length, anchorIndex);
}

function moveToNextTrack(autoplay: boolean): void {
  const activeQueue = state.queue;
  if (!activeQueue || activeQueue.tracks.length === 0) return;

  if (state.repeatMode === "one") {
    audio.currentTime = 0;
    if (autoplay) {
      void audio.play().catch(() => {
        state.playing = false;
      });
    }
    return;
  }

  const nextPos = state.orderPos + 1;
  if (nextPos < state.playOrder.length) {
    loadByOrderPos(nextPos, autoplay);
    return;
  }

  if (state.repeatMode === "all") {
    const wrappedOrder = generateWrappedOrder();
    if (wrappedOrder.length === 0) return;

    state.playOrder = wrappedOrder;
    state.orderPos = 0;
    loadTrack(wrappedOrder[0], autoplay);
    return;
  }

  state.playing = false;
}

function attachListeners(): void {
  if (listenersAttached) return;

  audio.addEventListener("timeupdate", () => {
    state.currentTime = audio.currentTime || 0;
  });

  audio.addEventListener("loadedmetadata", () => {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (pendingRestoreTime !== null && Number.isFinite(audio.duration) && audio.duration > 0) {
      const nextTime = clamp(pendingRestoreTime, 0, audio.duration);
      audio.currentTime = nextTime;
      state.currentTime = nextTime;
      pendingRestoreTime = null;
    }
  });

  audio.addEventListener("canplay", () => {
    flushPendingAutoplay();
  });

  audio.addEventListener("play", () => {
    state.playing = true;
    state.hasStartedPlayback = true;
  });

  audio.addEventListener("pause", () => {
    state.playing = false;
  });

  audio.addEventListener("ended", () => {
    moveToNextTrack(true);
  });

  watch(
    () => state.volume,
    (value) => {
      audio.volume = clamp(value, 0, 1);
    },
    { immediate: true }
  );

  watch(
    () => state.muted,
    (value) => {
      audio.muted = value;
    },
    { immediate: true }
  );

  watch(
    () => [
      state.queue?.queueKey ?? "",
      state.currentIndex,
      state.currentTime,
      state.volume,
      state.muted,
      state.shuffleEnabled,
      state.repeatMode,
      state.hasStartedPlayback,
      state.playing,
      state.orderPos,
      state.playOrder.join(",")
    ],
    () => {
      persistState();
    }
  );

  listenersAttached = true;
}

function setQueue(nextQueue: GlobalPlayerQueue): void {
  const activeQueue = state.queue;
  if (activeQueue && activeQueue.queueKey === nextQueue.queueKey) {
    return;
  }

  audio.pause();
  destroyHls();

  state.queue = nextQueue;

  const order = state.shuffleEnabled
    ? buildShuffledOrder(nextQueue.tracks.length, 0)
    : buildSequentialOrder(nextQueue.tracks.length);

  state.playOrder = order;
  state.currentIndex = order[0] ?? 0;
  state.orderPos = 0;
  state.currentTime = 0;
  state.duration = 0;
  state.playing = false;
  state.trackDurations = Object.fromEntries(
    nextQueue.tracks
      .map((track) => [getTrackPlaybackUrl(track), track.duration])
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
  );

  audio.removeAttribute("src");
  audio.load();
}

function clearPlayer(): void {
  audio.pause();
  destroyHls();
  audio.removeAttribute("src");
  audio.load();
  pendingRestoreTime = null;

  state.queue = null;
  state.currentIndex = 0;
  state.playing = false;
  state.currentTime = 0;
  state.duration = 0;
  state.hasStartedPlayback = false;
  state.playOrder = [];
  state.orderPos = 0;
  state.trackDurations = {};

  persistState();
}

function togglePlayPause(): void {
  const activeQueue = state.queue;
  const activeTrack = activeQueue?.tracks[state.currentIndex];
  if (!activeQueue || !activeTrack) return;

  if (audio.paused) {
    requestImmediatePlayback();
  } else {
    audio.pause();
  }
}

function playTrack(index: number): void {
  const activeQueue = state.queue;
  if (!activeQueue) return;
  if (index < 0 || index >= activeQueue.tracks.length) return;

  if (state.shuffleEnabled) {
    state.playOrder = buildShuffledOrder(activeQueue.tracks.length, index);
    state.orderPos = 0;
  }

  loadTrack(index, true);
}

function nextTrack(): void {
  moveToNextTrack(true);
}

function prevTrack(): void {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  const prevPos = state.orderPos - 1;
  if (prevPos >= 0) {
    loadByOrderPos(prevPos, true);
    return;
  }

  if (state.repeatMode === "all") {
    const wrappedPos = Math.max(0, state.playOrder.length - 1);
    loadByOrderPos(wrappedPos, true);
    return;
  }

  audio.currentTime = 0;
}

function seekByRatio(ratio: number): void {
  const length = Number.isFinite(audio.duration) ? audio.duration : 0;
  if (!length) return;

  const nextTime = clamp(ratio, 0, 1) * length;
  audio.currentTime = nextTime;
  state.currentTime = nextTime;
}

function setVolume(value: number): void {
  const nextVolume = clamp(value, 0, 1);
  state.volume = nextVolume;
  if (nextVolume > 0 && state.muted) {
    state.muted = false;
  }
}

function toggleMute(): void {
  state.muted = !state.muted;
}

function toggleShuffle(): void {
  const activeQueue = state.queue;
  if (!activeQueue) return;

  const nextValue = !state.shuffleEnabled;
  state.shuffleEnabled = nextValue;

  if (nextValue) {
    state.playOrder = buildShuffledOrder(activeQueue.tracks.length, state.currentIndex);
    state.orderPos = 0;
    return;
  }

  state.playOrder = buildSequentialOrder(activeQueue.tracks.length);
  state.orderPos = state.currentIndex;
}

function cycleRepeatMode(): void {
  state.repeatMode =
    state.repeatMode === "off" ? "all" : state.repeatMode === "all" ? "one" : "off";
}

const currentTrack = computed(() => {
  return state.queue?.tracks[state.currentIndex] ?? null;
});

const upcomingTracks = computed<UpcomingTrack[]>(() => {
  const activeQueue = state.queue;
  if (!activeQueue || state.playOrder.length === 0) return [];

  const tail = state.playOrder.slice(state.orderPos + 1);
  const indices = state.repeatMode === "all" ? [...tail, ...state.playOrder.slice(0, state.orderPos)] : tail;

  return indices.slice(0, 24).map((index) => {
    const track = activeQueue.tracks[index];
    const playbackUrl = getTrackPlaybackUrl(track);

    return {
      index,
      track,
      duration: typeof state.trackDurations[playbackUrl] === "number" ? state.trackDurations[playbackUrl] : null
    };
  });
});

export function usePlayer() {
  attachListeners();
  restorePersistedState();

  return {
    state: readonly(state),
    currentTrack,
    upcomingTracks,
    setQueue,
    togglePlayPause,
    playTrack,
    nextTrack,
    prevTrack,
    seekByRatio,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeatMode,
    clearPlayer
  };
}
