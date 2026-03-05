import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

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

type RepeatMode = "off" | "all" | "one";

type UpcomingTrack = {
  index: number;
  track: GlobalPlayerTrack;
  duration: number | null;
};

type GlobalPlayerContextValue = {
  queue: GlobalPlayerQueue | null;
  currentTrack: GlobalPlayerTrack | null;
  currentIndex: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  hasStartedPlayback: boolean;
  upcomingTracks: UpcomingTrack[];
  setQueue: (queue: GlobalPlayerQueue) => void;
  togglePlayPause: () => void;
  playTrack: (index: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekByRatio: (ratio: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
};

const GlobalPlayerContext = createContext<GlobalPlayerContextValue | null>(null);

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

export function GlobalPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const queueRef = useRef<GlobalPlayerQueue | null>(null);
  const indexRef = useRef(0);
  const orderRef = useRef<number[]>([]);
  const orderPosRef = useRef(0);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>("off");
  const mutedRef = useRef(false);
  const previousVolumeRef = useRef(1);

  const [queue, setQueueState] = useState<GlobalPlayerQueue | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [playOrder, setPlayOrder] = useState<number[]>([]);
  const [orderPos, setOrderPos] = useState(0);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [trackDurations, setTrackDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    orderRef.current = playOrder;
  }, [playOrder]);

  useEffect(() => {
    orderPosRef.current = orderPos;
  }, [orderPos]);

  useEffect(() => {
    shuffleRef.current = shuffleEnabled;
  }, [shuffleEnabled]);

  useEffect(() => {
    repeatRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const syncOrderPosition = useCallback((index: number) => {
    const activeQueue = queueRef.current;
    if (!activeQueue) return;

    if (!shuffleRef.current) {
      setOrderPos(index);
      orderPosRef.current = index;
      return;
    }

    const existingPos = orderRef.current.indexOf(index);
    if (existingPos >= 0) {
      setOrderPos(existingPos);
      orderPosRef.current = existingPos;
      return;
    }

    const rebuiltOrder = buildShuffledOrder(activeQueue.tracks.length, index);
    setPlayOrder(rebuiltOrder);
    orderRef.current = rebuiltOrder;
    setOrderPos(0);
    orderPosRef.current = 0;
  }, []);

  const loadTrack = useCallback(
    (index: number, autoplay: boolean) => {
      const activeQueue = queueRef.current;
      const track = activeQueue?.tracks[index];
      if (!activeQueue || !track) return;

      const audio = audioRef.current;
      const trackUrl = new URL(track.url, window.location.origin).toString();

      indexRef.current = index;
      setCurrentIndex(index);

      if (audio.src !== trackUrl) {
        audio.src = track.url;
        audio.load();
      }

      syncOrderPosition(index);

      if (autoplay) {
        void audio.play().catch(() => {
          setPlaying(false);
        });
      }
    },
    [syncOrderPosition]
  );

  const loadByOrderPos = useCallback(
    (targetOrderPos: number, autoplay: boolean) => {
      const targetIndex = orderRef.current[targetOrderPos];
      if (typeof targetIndex !== "number") return;

      setOrderPos(targetOrderPos);
      orderPosRef.current = targetOrderPos;
      loadTrack(targetIndex, autoplay);
    },
    [loadTrack]
  );

  const generateWrappedOrder = useCallback((anchorIndex?: number) => {
    const activeQueue = queueRef.current;
    if (!activeQueue) return [];

    if (!shuffleRef.current) {
      return buildSequentialOrder(activeQueue.tracks.length);
    }

    return buildShuffledOrder(activeQueue.tracks.length, anchorIndex);
  }, []);

  const moveToNextTrack = useCallback(
    (autoplay: boolean) => {
      const activeQueue = queueRef.current;
      if (!activeQueue || activeQueue.tracks.length === 0) return;

      if (repeatRef.current === "one") {
        const audio = audioRef.current;
        audio.currentTime = 0;
        if (autoplay) {
          void audio.play().catch(() => {
            setPlaying(false);
          });
        }
        return;
      }

      const nextPos = orderPosRef.current + 1;
      if (nextPos < orderRef.current.length) {
        loadByOrderPos(nextPos, autoplay);
        return;
      }

      if (repeatRef.current === "all") {
        const wrappedOrder = generateWrappedOrder();
        if (wrappedOrder.length === 0) return;

        setPlayOrder(wrappedOrder);
        orderRef.current = wrappedOrder;
        setOrderPos(0);
        orderPosRef.current = 0;

        loadTrack(wrappedOrder[0], autoplay);
        return;
      }

      setPlaying(false);
    },
    [generateWrappedOrder, loadByOrderPos, loadTrack]
  );

  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onPlay = () => {
      setPlaying(true);
      setHasStartedPlayback(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      moveToNextTrack(true);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [moveToNextTrack]);

  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const activeQueue = queueRef.current;
    if (!activeQueue) return;

    let cancelled = false;
    setTrackDurations({});

    const probes = activeQueue.tracks.map((track) => {
      return new Promise<void>((resolve) => {
        const probe = new Audio();
        probe.preload = "metadata";

        const cleanup = () => {
          probe.removeEventListener("loadedmetadata", onLoaded);
          probe.removeEventListener("error", onError);
          resolve();
        };

        const onLoaded = () => {
          if (!cancelled && Number.isFinite(probe.duration) && probe.duration > 0) {
            setTrackDurations((previous) => ({
              ...previous,
              [track.url]: probe.duration
            }));
          }
          cleanup();
        };

        const onError = () => cleanup();

        probe.addEventListener("loadedmetadata", onLoaded);
        probe.addEventListener("error", onError);
        probe.src = track.url;
      });
    });

    void Promise.allSettled(probes);

    return () => {
      cancelled = true;
    };
  }, [queue]);

  const setQueue = useCallback((nextQueue: GlobalPlayerQueue) => {
    const activeQueue = queueRef.current;
    if (activeQueue && activeQueue.queueKey === nextQueue.queueKey) {
      return;
    }

    const audio = audioRef.current;
    audio.pause();

    queueRef.current = nextQueue;
    setQueueState(nextQueue);

    const order = shuffleRef.current
      ? buildShuffledOrder(nextQueue.tracks.length, 0)
      : buildSequentialOrder(nextQueue.tracks.length);

    setPlayOrder(order);
    orderRef.current = order;

    indexRef.current = order[0] ?? 0;
    setCurrentIndex(order[0] ?? 0);

    setOrderPos(0);
    orderPosRef.current = 0;

    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);

    const firstTrackIndex = order[0];
    const firstTrack = typeof firstTrackIndex === "number" ? nextQueue.tracks[firstTrackIndex] : undefined;
    if (!firstTrack) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = firstTrack.url;
    audio.load();
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    const activeQueue = queueRef.current;
    const activeTrack = activeQueue?.tracks[indexRef.current];

    if (!activeQueue || !activeTrack) return;

    if (audio.paused) {
      void audio.play().catch(() => {
        setPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, []);

  const playTrack = useCallback(
    (index: number) => {
      const activeQueue = queueRef.current;
      if (!activeQueue) return;
      if (index < 0 || index >= activeQueue.tracks.length) return;

      if (shuffleRef.current) {
        const nextOrder = buildShuffledOrder(activeQueue.tracks.length, index);
        setPlayOrder(nextOrder);
        orderRef.current = nextOrder;
        setOrderPos(0);
        orderPosRef.current = 0;
      }

      loadTrack(index, true);
    },
    [loadTrack]
  );

  const nextTrack = useCallback(() => {
    moveToNextTrack(true);
  }, [moveToNextTrack]);

  const prevTrack = useCallback(() => {
    const audio = audioRef.current;

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const prevPos = orderPosRef.current - 1;
    if (prevPos >= 0) {
      loadByOrderPos(prevPos, true);
      return;
    }

    if (repeatRef.current === "all") {
      const wrappedPos = Math.max(0, orderRef.current.length - 1);
      loadByOrderPos(wrappedPos, true);
      return;
    }

    audio.currentTime = 0;
  }, [loadByOrderPos]);

  const seekByRatio = useCallback((ratio: number) => {
    const audio = audioRef.current;
    const length = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (!length) return;

    const nextTime = clamp(ratio, 0, 1) * length;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const setVolume = useCallback((value: number) => {
    const nextVolume = clamp(value, 0, 1);
    setVolumeState(nextVolume);

    if (nextVolume > 0) {
      previousVolumeRef.current = nextVolume;
      if (mutedRef.current) {
        setMuted(false);
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!mutedRef.current) {
      if (volume > 0) {
        previousVolumeRef.current = volume;
      }
      setMuted(true);
      return;
    }

    setMuted(false);
    if (volume <= 0) {
      setVolumeState(previousVolumeRef.current > 0 ? previousVolumeRef.current : 1);
    }
  }, [volume]);

  const toggleShuffle = useCallback(() => {
    const activeQueue = queueRef.current;
    if (!activeQueue) return;

    const nextValue = !shuffleRef.current;
    setShuffleEnabled(nextValue);

    if (nextValue) {
      const shuffled = buildShuffledOrder(activeQueue.tracks.length, indexRef.current);
      setPlayOrder(shuffled);
      orderRef.current = shuffled;
      setOrderPos(0);
      orderPosRef.current = 0;
      return;
    }

    const sequential = buildSequentialOrder(activeQueue.tracks.length);
    setPlayOrder(sequential);
    orderRef.current = sequential;
    setOrderPos(indexRef.current);
    orderPosRef.current = indexRef.current;
  }, []);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => {
      const next = prev === "off" ? "all" : prev === "all" ? "one" : "off";
      repeatRef.current = next;
      return next;
    });
  }, []);

  const currentTrack = queue?.tracks[currentIndex] ?? null;

  const upcomingTracks = useMemo<UpcomingTrack[]>(() => {
    const activeQueue = queue;
    if (!activeQueue || playOrder.length === 0) return [];

    const tail = playOrder.slice(orderPos + 1);

    const indices =
      repeatMode === "all"
        ? [...tail, ...playOrder.slice(0, orderPos)]
        : tail;

    return indices.slice(0, 24).map((index) => ({
      index,
      track: activeQueue.tracks[index],
      duration: typeof trackDurations[activeQueue.tracks[index].url] === "number" ? trackDurations[activeQueue.tracks[index].url] : null
    }));
  }, [queue, playOrder, orderPos, repeatMode, trackDurations]);

  const contextValue = useMemo<GlobalPlayerContextValue>(
    () => ({
      queue,
      currentTrack,
      currentIndex,
      playing,
      currentTime,
      duration,
      volume,
      muted,
      shuffleEnabled,
      repeatMode,
      hasStartedPlayback,
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
    }),
    [
      queue,
      currentTrack,
      currentIndex,
      playing,
      currentTime,
      duration,
      volume,
      muted,
      shuffleEnabled,
      repeatMode,
      hasStartedPlayback,
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
    ]
  );

  return <GlobalPlayerContext.Provider value={contextValue}>{children}</GlobalPlayerContext.Provider>;
}

export function useGlobalPlayer() {
  const context = useContext(GlobalPlayerContext);
  if (!context) {
    throw new Error("useGlobalPlayer must be used inside GlobalPlayerProvider");
  }
  return context;
}
