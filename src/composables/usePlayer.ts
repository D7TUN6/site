import { computed, reactive, readonly, watch } from "vue";

export type GlobalPlayerTrack = {
  title: string;
  url: string;
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

let listenersAttached = false;
let durationProbeToken = 0;
let durationProbeHandle: number | null = null;
let durationProbeQueueKey: string | null = null;
let isDurationProbeRunning = false;

type IdleAwareWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

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

function loadTrack(index: number, autoplay: boolean): void {
  const activeQueue = state.queue;
  const track = activeQueue?.tracks[index];
  if (!activeQueue || !track) return;

  const targetUrl = new URL(track.url, window.location.origin).toString();
  state.currentIndex = index;

  if (audio.src !== targetUrl) {
    audio.src = track.url;
    audio.load();
  }

  syncOrderPosition(index);

  if (autoplay) {
    void audio.play().catch(() => {
      state.playing = false;
    });
  }
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

function clearDurationProbeSchedule(): void {
  if (durationProbeHandle === null) return;

  const idleWindow = window as IdleAwareWindow;
  if (typeof idleWindow.cancelIdleCallback === "function") {
    idleWindow.cancelIdleCallback(durationProbeHandle);
  } else {
    window.clearTimeout(durationProbeHandle);
  }

  durationProbeHandle = null;
}

function probeSingleTrackDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";

    let timeoutId: number | null = window.setTimeout(() => {
      timeoutId = null;
      cleanup(null);
    }, 8000);

    const cleanup = (value: number | null) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      probe.removeEventListener("loadedmetadata", onLoaded);
      probe.removeEventListener("error", onError);
      resolve(value);
    };

    const onLoaded = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        cleanup(probe.duration);
        return;
      }

      cleanup(null);
    };

    const onError = () => cleanup(null);

    probe.addEventListener("loadedmetadata", onLoaded);
    probe.addEventListener("error", onError);
    probe.src = url;
  });
}

async function probeTrackDurations(queueKey: string): Promise<void> {
  const activeQueue = state.queue;
  if (!activeQueue || activeQueue.queueKey !== queueKey || activeQueue.tracks.length === 0) {
    return;
  }

  const token = ++durationProbeToken;
  isDurationProbeRunning = true;

  try {
    for (const track of activeQueue.tracks) {
      const duration = await probeSingleTrackDuration(track.url);
      if (token !== durationProbeToken) {
        return;
      }

      if (typeof duration === "number") {
        state.trackDurations = {
          ...state.trackDurations,
          [track.url]: duration
        };
      }
    }

    durationProbeQueueKey = queueKey;
  } finally {
    if (token === durationProbeToken) {
      isDurationProbeRunning = false;
    }
  }
}

function scheduleDurationProbe(): void {
  const activeQueue = state.queue;
  if (!activeQueue || activeQueue.tracks.length === 0) return;
  if (durationProbeQueueKey === activeQueue.queueKey || isDurationProbeRunning) return;

  clearDurationProbeSchedule();

  const run = () => {
    durationProbeHandle = null;
    void probeTrackDurations(activeQueue.queueKey);
  };

  const idleWindow = window as IdleAwareWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    durationProbeHandle = idleWindow.requestIdleCallback(run, { timeout: 1800 });
    return;
  }

  durationProbeHandle = window.setTimeout(run, 900);
}

function attachListeners(): void {
  if (listenersAttached) return;

  audio.addEventListener("timeupdate", () => {
    state.currentTime = audio.currentTime || 0;
  });

  audio.addEventListener("loadedmetadata", () => {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  });

  audio.addEventListener("play", () => {
    state.playing = true;
    state.hasStartedPlayback = true;
    scheduleDurationProbe();
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

  listenersAttached = true;
}

function setQueue(nextQueue: GlobalPlayerQueue): void {
  const activeQueue = state.queue;
  if (activeQueue && activeQueue.queueKey === nextQueue.queueKey) {
    return;
  }

  audio.pause();
  clearDurationProbeSchedule();
  durationProbeToken += 1;
  isDurationProbeRunning = false;
  durationProbeQueueKey = null;

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
  state.trackDurations = {};

  audio.removeAttribute("src");
  audio.load();
}

function togglePlayPause(): void {
  const activeQueue = state.queue;
  const activeTrack = activeQueue?.tracks[state.currentIndex];
  if (!activeQueue || !activeTrack) return;

  if (audio.paused) {
    void audio.play().catch(() => {
      state.playing = false;
    });
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

  return indices.slice(0, 24).map((index) => ({
    index,
    track: activeQueue.tracks[index],
    duration: typeof state.trackDurations[activeQueue.tracks[index].url] === "number" ? state.trackDurations[activeQueue.tracks[index].url] : null
  }));
});

export function usePlayer() {
  attachListeners();

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
    cycleRepeatMode
  };
}
