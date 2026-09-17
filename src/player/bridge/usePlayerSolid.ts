import { createEffect, createMemo, createRoot, createSignal, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { getAudioEngine } from '@/lib/audio/audio-engine.js'
import { getReleaseBySlug } from '@/lib/releaseManifest.js'
import { buildPlayerQueueFromRelease } from '../queue.js'
import { clamp, buildSequentialOrder, buildShuffledOrder } from '../order.js'
import { PlayerStateManager } from '../core/PlayerState.js'
import { PlayerEngine } from '../core/PlayerEngine.js'
import {
  setQueue as actionsSetQueue,
  playTrack as actionsPlayTrack,
  nextTrack as actionsNextTrack,
  prevTrack as actionsPrevTrack,
  seekByRatio as actionsSeekByRatio,
  togglePlayPause as actionsTogglePlayPause,
  clearPlayer as actionsClearPlayer,
  moveToNextTrack as actionsMoveToNextTrack,
} from '../core/PlayerActions.js'
import { getTrackPlaybackUrl } from '../api/StreamApi.js'
import { readPersistedPlayerState, writePersistedPlayerState, clearPersistedPlayerState } from '../storage/PlayerStorage.js'
import { reportListener, getNowPlaying } from '@/lib/api/radio'
import type { GlobalPlayerQueue, RepeatMode, UpcomingTrack, PersistedPlayerState } from '../types.js'

const LOUD_TARGET_LUFS = -14
const LOUD_MODE_LUFS = -11
const LOUD_MODE_MAX_BOOST_DB = 6

function computeNormalizationGain(
  trackLoudness: number | null | undefined,
  albumLoudness: number | null | undefined,
  context: 'album' | 'shuffle',
  mode: 'standard' | 'loud' | 'off',
): number {
  if (mode === 'off' || trackLoudness == null || !Number.isFinite(trackLoudness)) return 1
  const targetLufs = mode === 'loud' ? LOUD_MODE_LUFS : LOUD_TARGET_LUFS
  const reference = context === 'album' && albumLoudness != null && Number.isFinite(albumLoudness)
    ? Math.max(trackLoudness, albumLoudness)
    : trackLoudness
  const gainDb = targetLufs - reference
  if (mode === 'loud') {
    return Math.pow(10, Math.max(-60, Math.min(LOUD_MODE_MAX_BOOST_DB, gainDb)) / 20)
  }
  // Standard: attenuate only
  return Math.pow(10, Math.min(0, gainDb) / 20)
}

let globalState: PlayerStateManager | null = null
let globalEngine: PlayerEngine | null = null
// Live-radio stream handling is shared across consumers the same way the
// engine is: only the radio page triggers start/stop, but the always-mounted
// NowPlayingBar must keep observing the stream after the page unmounts.
let radioPollTimer: number | null = null
let radioPagehideAttached = false
// The DOM <audio> listeners and the engine subscription are shared module-wide
// in the style of globalState/globalEngine themselves: several components can
// mount the same core (always-mounted NowPlayingBar + route-level
// ReleasePlayer). Unmounting one of them must not tear the shared listeners
// down, or the surviving bar stops reacting to timeupdate/play/pause events.
// Balance consumers with a reference count and detach only at zero.
let sharedListenerRefCount = 0
let sharedCleanupListeners: (() => void) | null = null
let sharedUnsubEngine: (() => void) | null = null

function getCore() {
  if (!globalState) globalState = new PlayerStateManager()
  if (!globalEngine) globalEngine = new PlayerEngine()
  return { state: globalState, engine: globalEngine }
}

async function buildQueueFromReleaseSlug(slug: string): Promise<GlobalPlayerQueue | null> {
  const release = getReleaseBySlug(slug)
  if (!release) return null
  return buildPlayerQueueFromRelease(release, 'en')
}

export function usePlayerSolid() {
  const { state, engine } = getCore()

  const [solidState, setSolidState] = createStore({ ...state.state })
  const unsubSolidSync = state.subscribeAll(() => setSolidState(reconcile({ ...state.state })))
  // Persist promptly when the track changes — a src swap does not always emit
  // a pause event, so resume state could otherwise lag one track behind.
  const unsubTrackPersist = state.subscribe('currentIndex', () => schedulePersist())

  let hasRestoredState = false
  let restoreLoadToken = 0
  let disposeVolume: (() => void) | null = null
  let persistTimer: number | null = null

  function persistState() {
    if (!state.state.queue) return clearPersistedPlayerState()
    const payload: PersistedPlayerState = {
      queueKey: state.state.queue.queueKey,
      currentIndex: state.state.currentIndex,
      trackIndex: state.state.queue.tracks[state.state.currentIndex]?.index ?? null,
      currentTime: Number.isFinite(state.state.currentTime) ? state.state.currentTime : 0,
      volume: state.state.volume,
      muted: state.state.muted,
      shuffleEnabled: state.state.shuffleEnabled,
      repeatMode: state.state.repeatMode,
      hasStartedPlayback: state.state.hasStartedPlayback,
      playOrder: [...state.state.playOrder],
      orderPos: state.state.orderPos,
      wasPlaying: state.state.playing,
    }
    writePersistedPlayerState(payload)
  }

  function schedulePersist() {
    if (typeof window === 'undefined' || persistTimer !== null) return
    persistTimer = window.setTimeout(() => { persistTimer = null; persistState() }, 1000)
  }

  function attachListeners() {
    sharedListenerRefCount++
    if (engine.audioEngineManager.listenersAttached) return
    const aem = engine.audioEngineManager
    const a = engine.audio
    const audioEngine = getAudioEngine()
    aem.initEngine()
    const updateBufferedTime = () => {
      state.updateField('bufferedTime', aem.computeBufferedTime())
    }
    const listeners: Array<[string, EventListener]> = [
      ['timeupdate', () => {
        state.setCurrentTime(aem.streamOffset + (a.currentTime || 0))
        engine.consecutiveAudioErrors = 0
        updateBufferedTime()
        const bucket = Math.floor(state.state.currentTime / 30)
        if (bucket !== engine.lastPersistedPlaybackBucket) { engine.lastPersistedPlaybackBucket = bucket; schedulePersist() }
      }],
      ['loadedmetadata', () => {
        const rawDuration = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0
        const trackMetaDuration = engine.savedTrackDuration ?? (state.state.queue?.tracks[state.state.currentIndex]?.duration)
        let effective: number
        // Prefer the actual audio-element duration (real stream length).
        // Fall back to the manifest duration only when the audio element hasn't
        // reported one yet — the manifest value comes from ffprobe on the source
        // file and may be longer than the actual playback stream.
        if (rawDuration > 0) {
          effective = rawDuration
        } else if (typeof trackMetaDuration === 'number' && trackMetaDuration > 0) {
          effective = trackMetaDuration
        } else {
          effective = 0
        }
        state.setDuration(effective)
        engine.savedTrackDuration = null
        updateBufferedTime()
        if (engine.pendingRestoreTime != null && effective > 0) {
          const nextTime = clamp(engine.pendingRestoreTime, 0, effective)
          a.currentTime = nextTime
          state.setCurrentTime(nextTime)
          engine.pendingRestoreTime = null
        }
      }],
      ['durationchange', () => {
        const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0
        if (dur > 0 && state.state.duration !== dur) {
          state.setDuration(dur)
          updateBufferedTime()
        }
      }],
      ['progress', updateBufferedTime],
      ['canplay', () => aem.flushPendingAutoplay()],
      ['play', () => { state.setPlaying(true); state.updateField('hasStartedPlayback', true); audioEngine.resumeContext() }],
      ['pause', () => {
        state.setPlaying(false)
        // Stop the DSP graph from rendering while paused — the reverb/delay/
        // bitcrusher chain (incl. an AudioWorklet fallback on the main thread)
        // otherwise keeps burning CPU until the next play. Resume is handled by
        // the 'play' handler above.
        audioEngine.suspend()
        persistState()
      }],
      ['ended', () => {
        // Live radio never ends; if it does (server restarted mid-stream) the
        // RadioStreamEngine owns the reconnect. Never advance the track queue.
        if (state.state.radioActive) return
        actionsMoveToNextTrack(state, engine, true)
        persistState()
      }],
      ['error', async () => {
        // Only react to errors during active playback requests — idle metadata
        // failures (e.g. after loadBlank) must not skip tracks.
        // Also handle failures when audio.src is set (track load in-flight but
        // pendingAutoplay was consumed early by flushPendingAutoplay).
        if (!state.state.playing && !aem.pendingAutoplay && !a.src) return
        if (state.state.radioActive) {
          // Live radio reconnects itself through the RadioStreamEngine backoff
          // loop (same src reload — never recreates the <audio>/AudioContext,
          // so the DSP visualizer chain survives). Advancing the 1-track queue
          // here would just loop back into the same broken stream.
          return
        }
        engine.consecutiveAudioErrors += 1
        const limit = Math.max(state.state.queue?.tracks.length ?? 1, 1)
        if (engine.consecutiveAudioErrors > limit) {
          console.warn('audio: too many consecutive source errors — stopping')
          aem.pendingAutoplay = false
          state.setPlaying(false)
          return
        }
        console.warn('audio source failed — advancing to next track')
        actionsMoveToNextTrack(state, engine, true)
      }],
    ]
    for (const [ev, fn] of listeners) a.addEventListener(ev, fn)
    sharedCleanupListeners = () => {
      for (const [ev, fn] of listeners) a.removeEventListener(ev, fn)
    }
    let lastEngineQuality = audioEngine.state.quality
    sharedUnsubEngine = audioEngine.subscribe((s) => {
      if (s.quality !== lastEngineQuality) {
        lastEngineQuality = s.quality
        const queue = state.state.queue
        const track = queue?.tracks[state.state.currentIndex]
        const slug = queue?.queueKey
        if (!slug || !track) return
        // Transcoding presets start a fresh ffmpeg stream on every request, so
        // resume from the current position by re-requesting with a start offset.
        if (s.quality !== 'medium' && s.quality !== 'superb') {
          const dur = state.state.duration
          const ratio = dur > 0 ? state.state.currentTime / dur : 0
          engine.seekByQualityStream(slug, track, ratio, dur, state.state.playing)
          return
        }
        // medium (HLS) and superb (lossless source) streams are seekable, so a
        // plain reload can restore the position on the loadedmetadata event.
        aem.streamOffset = 0
        const wasPlaying = state.state.playing
        engine.savedTrackDuration = state.state.duration > 0 ? state.state.duration : null
        engine.pendingRestoreTime = state.state.currentTime
        a.pause()
        void engine.attachTrackSource(track, queue, wasPlaying)
      }
    })
    aem.listenersAttached = true
  }

  const audioStateManager = getAudioEngine().audioStateManager
  const [normMode, setNormMode] = createSignal(audioStateManager.state.normalizationMode)

  const unsubNormSync = audioStateManager.subscribe((s) => {
    setNormMode(s.normalizationMode)
  })
  onCleanup(() => unsubNormSync())

  disposeVolume = createRoot((dispose) => {
    createEffect(() => {
      const baseVolume = solidState.muted ? 0 : solidState.volume
      const mode = normMode()
      let normGain = 1
      if (solidState.queue) {
        const track = solidState.queue.tracks[solidState.currentIndex]
        if (track) {
          const isShuffle = solidState.shuffleEnabled
          const context = isShuffle ? 'shuffle' : 'album'
          let tl = track.trackLoudness
          let al = track.albumLoudness
          if (tl == null || al == null) {
            const release = getReleaseBySlug(solidState.queue!.queueKey)
            if (release) {
              const rt = release.tracks.find((t) => t.index === track.index)
              if (rt) {
                if (tl == null) tl = rt.trackLoudness ?? null
                if (al == null) al = rt.albumLoudness ?? null
              }
            }
          }
          normGain = computeNormalizationGain(tl, al, context, mode)
        }
      }
      const audioEngine = getAudioEngine()
      audioEngine.setMasterGain(baseVolume)
      audioEngine.setNormGain(normGain)
    })
    return dispose
  })

  function restorePersistedState() {
    if (typeof window === 'undefined' || hasRestoredState) return
    hasRestoredState = true
    const persisted = readPersistedPlayerState()
    if (!persisted?.queueKey) return
    const token = ++restoreLoadToken
    void buildQueueFromReleaseSlug(persisted.queueKey).then((q) => {
      if (token !== restoreLoadToken || !q || q.tracks.length === 0 || state.state.queue) return
      state.setQueue(q)
      // Remap the saved position by track identity: the queue shape may have
      // changed since the state was written (e.g. pre-order flags now filter
      // tracks out), so a blind clamp could point at the wrong track.
      let restoredPos = -1
      let trustedTime = false
      if (typeof persisted.trackIndex === 'number') {
        restoredPos = q.tracks.findIndex((t) => t.index === persisted.trackIndex)
        trustedTime = restoredPos >= 0
      }
      if (restoredPos < 0) {
        const sameShape = Array.isArray(persisted.playOrder) && persisted.playOrder.length === q.tracks.length
        if (sameShape) {
          restoredPos = clamp(persisted.currentIndex ?? 0, 0, q.tracks.length - 1)
          trustedTime = true
        } else {
          restoredPos = 0
        }
      }
      const restoredTime = trustedTime ? Math.max(0, persisted.currentTime || 0) : 0
      state.setState({
        currentIndex: restoredPos,
        currentTime: restoredTime,
        duration: typeof q.tracks[restoredPos]?.duration === 'number' ? (q.tracks[restoredPos]?.duration as number) : 0,
        volume: clamp(persisted.volume ?? 1, 0, 1),
        muted: Boolean(persisted.muted),
        shuffleEnabled: Boolean(persisted.shuffleEnabled),
        hasStartedPlayback: Boolean(persisted.hasStartedPlayback),
      })
      const mode = persisted.repeatMode
      state.updateField('repeatMode', mode === 'all' || mode === 'one' ? mode : 'off')
      const validOrder = Array.isArray(persisted.playOrder) && persisted.playOrder.length === q.tracks.length && persisted.playOrder.every((v) => Number.isInteger(v) && v >= 0 && v < q.tracks.length)
      const order = validOrder ? [...persisted.playOrder] : state.state.shuffleEnabled ? buildShuffledOrder(q.tracks.length, state.state.currentIndex) : buildSequentialOrder(q.tracks.length)
      state.updateField('playOrder', order)
      state.updateField('orderPos', clamp(validOrder ? persisted.orderPos ?? order.indexOf(state.state.currentIndex) : order.indexOf(state.state.currentIndex), 0, Math.max(order.length - 1, 0)))
      state.updateField('trackDurations', Object.fromEntries(q.tracks.map((t) => [getTrackPlaybackUrl(t, q), t.duration]).filter((e): e is [string, number] => typeof e[1] === 'number')))
      engine.audioEngineManager.streamOffset = 0
      engine.pendingRestoreTime = state.state.currentTime
      void engine.attachTrackSource(q.tracks[state.state.currentIndex], q, false)
    }).catch(() => clearPersistedPlayerState())
  }

  attachListeners()
  restorePersistedState()

  // ── Radio ────────────────────────────────────────────────────────────────
    // The server's NowPlayingTracker records startTimestamp (epoch ms) when the
    // on-air title changes (+ catalog match), so "elapsed now" is simply
    // Date.now() - startTimestamp — computed locally at every poll tick, no
    // deep-catalog offset math needed (that was the HLS VOD era).

  async function refreshRadioTrack() {
    if (!state.state.radioActive) return
    const np = await getNowPlaying()
    if (!state.state.radioActive || !np.ok || !np.title) return
    const duration = np.duration ?? 0
    let elapsed = np.startTimestamp ? (Date.now() - np.startTimestamp) / 1000 : (np.elapsed ?? 0)
    if (duration > 0) elapsed = Math.max(0, Math.min(elapsed, duration))
    state.setState({
      radioTrack: {
        title: np.title,
        artist: np.artist ?? '',
        album: np.album ?? '',
        coverUrl: np.coverUrl ?? null,
        elapsed,
        duration,
        upcoming: np.upcoming ?? [],
        source: np.source ?? 'live',
      },
    })
  }

  function startRadioPolling() {
    stopRadioPolling()
    radioPollTimer = window.setInterval(() => {
      refreshRadioTrack().catch(() => {})
      reportListener(0).catch(() => {})
    }, 1000)
  }

  function stopRadioPolling() {
    if (radioPollTimer !== null) clearInterval(radioPollTimer)
    radioPollTimer = null
  }

  function teardownRadio() {
    if (!state.state.radioActive) return
    stopRadioPolling()
    engine.teardownRadioStream()
    engine.audio.removeAttribute('src')
    engine.audio.load()
    engine.pendingRestoreTime = null
    engine.lastPersistedPlaybackBucket = -1
    state.setState({ radioActive: false, radioTrack: null, playing: false })
    reportListener(-1).catch(() => {})
  }

  async function doStartRadio(): Promise<void> {
    state.updateField('hasStartedPlayback', true)
    state.updateField('radioActive', true)
    state.updateField('radioTrack', null)
    state.updateField('currentTime', 0)
    state.updateField('duration', 0)
    state.updateField('bufferedTime', 0)
    try { await reportListener(1) } catch { }
    const started = await engine.attachRadioStream(() => state.state.radioActive && state.state.playing)
    if (!started) {
      console.warn('radio: native ogg playback unavailable — stopping')
      stopRadioPolling()
      reportListener(-1).catch(() => {})
      state.setState({ radioActive: false, playing: false })
      return
    }
    startRadioPolling()
    if (!radioPagehideAttached) {
      radioPagehideAttached = true
      window.addEventListener('pagehide', () => {
        if (state.state.radioActive) reportListener(-1).catch(() => {})
      })
    }
    refreshRadioTrack().catch(() => {})
  }

  async function startRadio(): Promise<void> {
    if (state.state.radioActive) return
    if (state.state.queue) {
      actionsClearPlayer(state, engine)
      engine.lastPersistedPlaybackBucket = -1
    }
    await doStartRadio()
  }

  // Ensure listeners stay alive across route changes: the shared core served
  // both the always-mounted NowPlayingBar and the route-level ReleasePlayer, so
  // only the last consumer should detach the shared listeners. See module scope.
  onCleanup(() => {
    unsubSolidSync?.()
    unsubTrackPersist?.()
    disposeVolume?.()
    sharedListenerRefCount = Math.max(0, sharedListenerRefCount - 1)
    if (sharedListenerRefCount === 0) {
      sharedCleanupListeners?.()
      sharedCleanupListeners = null
      sharedUnsubEngine?.()
      sharedUnsubEngine = null
      engine.audioEngineManager.listenersAttached = false
    }
  })

  const currentTrack = createMemo(() => solidState.queue?.tracks[solidState.currentIndex] ?? null)
  const upcomingTracks = createMemo<UpcomingTrack[]>(() => {
    const queue = solidState.queue
    if (!queue || solidState.playOrder.length === 0) return []
    const durations = solidState.trackDurations
    const tail = solidState.playOrder.slice(solidState.orderPos + 1)
    const indices = solidState.repeatMode === 'all' ? [...tail, ...solidState.playOrder.slice(0, solidState.orderPos)] : tail
    return indices.slice(0, 24).reduce<UpcomingTrack[]>((acc, index) => {
      const track = queue.tracks[index]
      if (!track) return acc
      const playbackUrl = getTrackPlaybackUrl(track, queue)
      acc.push({ index, track, duration: typeof durations[playbackUrl] === 'number' ? durations[playbackUrl] : null })
      return acc
    }, [])
  })

  return {
    state: solidState,
    currentTrack,
    upcomingTracks,
    radioActive: () => state.state.radioActive,
    setQueue: (nextQueue: GlobalPlayerQueue) => {
      teardownRadio()
      actionsSetQueue(state, engine, nextQueue)
    },
    togglePlayPause: () => {
      if (state.state.radioActive) {
        if (engine.paused) {
          engine.audioEngineManager.pendingAutoplay = true
          engine.audioEngineManager.flushPendingAutoplay()
        } else {
          engine.pause()
        }
        return
      }
      actionsTogglePlayPause(state, engine)
    },
    playTrack: (index: number) => {
      teardownRadio()
      actionsPlayTrack(state, engine, index)
    },
    nextTrack: () => {
      if (state.state.radioActive) return
      actionsNextTrack(state, engine)
    },
    prevTrack: () => {
      if (state.state.radioActive) return
      actionsPrevTrack(state, engine)
    },
    seekByRatio: (ratio: number) => {
      if (state.state.radioActive) return
      actionsSeekByRatio(state, engine, ratio)
    },
    setVolume: (value: number) => { const next = clamp(value, 0, 1); state.updateField('volume', next); if (next > 0 && state.state.muted) state.updateField('muted', false) },
    toggleMute: () => state.updateField('muted', !state.state.muted),
    toggleShuffle: () => {
      if (state.state.radioActive || !state.state.queue) return
      const next = !state.state.shuffleEnabled
      state.updateField('shuffleEnabled', next)
      if (next) {
        state.updateField('playOrder', buildShuffledOrder(state.state.queue.tracks.length, state.state.currentIndex))
        state.updateField('orderPos', 0)
      } else {
        state.updateField('playOrder', buildSequentialOrder(state.state.queue.tracks.length))
        state.updateField('orderPos', state.state.currentIndex)
      }
    },
    cycleRepeatMode: () => {
      if (state.state.radioActive) return
      const modes: RepeatMode[] = ['off', 'all', 'one']
      const idx = modes.indexOf(state.state.repeatMode)
      state.updateField('repeatMode', modes[(idx + 1) % modes.length])
    },
    startRadio,
    stopRadio: teardownRadio,
    toggleRadio: () => { if (state.state.radioActive) teardownRadio(); else void startRadio() },
    clearPlayer: () => {
      teardownRadio()
      actionsClearPlayer(state, engine)
      engine.lastPersistedPlaybackBucket = -1
      persistState()
    },
    destroy: () => {
      unsubSolidSync?.()
      unsubTrackPersist?.()
      disposeVolume?.()
      disposeVolume = null
      if (sharedListenerRefCount > 0) {
        sharedListenerRefCount--
        if (sharedListenerRefCount === 0) {
          sharedCleanupListeners?.()
          sharedCleanupListeners = null
          sharedUnsubEngine?.()
          sharedUnsubEngine = null
          engine.audioEngineManager.listenersAttached = false
        }
      }
    },
  }
}
