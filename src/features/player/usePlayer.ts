import { createMemo } from 'solid-js'
import { createStore } from 'solid-js/store'
import Hls from 'hls.js/light'
import { buildSequentialOrder, buildShuffledOrder, clamp } from '@/player/order'
import {
  clearPersistedPlayerState,
  readPersistedPlayerState,
  type PersistedPlayerState,
  writePersistedPlayerState,
} from '@/player/storage'
import { getReleaseBySlug } from '@/lib/releaseManifest'
import { buildPlayerQueueFromRelease, type GlobalPlayerQueue, type GlobalPlayerTrack } from '@/player/queue'

export type RepeatMode = 'off' | 'all' | 'one'
export type UpcomingTrack = { index: number; track: GlobalPlayerTrack; duration: number | null }

const [state, setState] = createStore({
  queue: null as GlobalPlayerQueue | null,
  currentIndex: 0,
  playing: false,
  currentTime: 0,
  duration: 0,
  bufferedTime: 0,
  volume: 1,
  muted: false,
  shuffleEnabled: false,
  repeatMode: 'off' as RepeatMode,
  hasStartedPlayback: false,
  playOrder: [] as number[],
  orderPos: 0,
  trackDurations: {} as Record<string, number>,
})

const audio = new Audio()
audio.preload = 'metadata'
const supportsOggOpus = audio.canPlayType('audio/ogg; codecs="opus"') !== ''
const supportsNativeHls = audio.canPlayType('application/vnd.apple.mpegurl') !== ''
let hls: Hls | null = null
let pendingAutoplay = false
let playRequestInFlight = false
let pendingRestoreTime: number | null = null
let hasRestoredState = false
let persistTimer: number | null = null
let lastPersistedPlaybackBucket = -1
let sourceLoadToken = 0
let restoreLoadToken = 0
let listenersAttached = false

function persistState() {
  if (!state.queue) return clearPersistedPlayerState()
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
    wasPlaying: state.playing,
  }
  writePersistedPlayerState(payload)
}
function schedulePersist() {
  if (typeof window === 'undefined' || persistTimer !== null) return
  persistTimer = window.setTimeout(() => { persistTimer = null; persistState() }, 1000)
}
async function buildQueueFromReleaseSlug(slug: string): Promise<GlobalPlayerQueue | null> {
  const release = getReleaseBySlug(slug)
  if (!release) return null
  return buildPlayerQueueFromRelease(release, 'en')
}
function getTrackPlaybackUrl(track: GlobalPlayerTrack) {
  if (track.streamUrl) return track.streamUrl
  if (!supportsOggOpus && /\.ogg(?:$|[?#])/i.test(track.url) && (track as any).fallbackUrl) return (track as any).fallbackUrl
  return track.url
}
function destroyHls() { hls?.destroy(); hls = null; pendingAutoplay = false; playRequestInFlight = false }
function requestImmediatePlayback() {
  if (playRequestInFlight) return
  playRequestInFlight = true
  void audio.play().catch(() => setState('playing', false)).finally(() => { playRequestInFlight = false })
}
function flushPendingAutoplay() { if (!pendingAutoplay) return; pendingAutoplay = false; requestImmediatePlayback() }
function canUseNativeHls(track: GlobalPlayerTrack) { return Boolean(track.streamUrl && supportsNativeHls) }
function applyTrackSource(playbackUrl: string, targetUrl: string, autoplay: boolean) {
  destroyHls(); if (audio.src !== targetUrl) { audio.src = playbackUrl; audio.load() }
  if (autoplay) requestImmediatePlayback(); flushPendingAutoplay()
}
function attachHlsTrack(track: GlobalPlayerTrack, autoplay: boolean, requestToken: number) {
  if (requestToken !== sourceLoadToken || !track.streamUrl) return
  if (!Hls.isSupported()) {
    const fb = (track as any).fallbackUrl
    if (fb) applyTrackSource(fb, new URL(fb, window.location.origin).toString(), autoplay)
    return
  }
  destroyHls()
  hls = new Hls({ startPosition: -1, enableWorker: true })
  hls.on(Hls.Events.MANIFEST_PARSED, () => flushPendingAutoplay())
  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (!data.fatal) return
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) return hls?.recoverMediaError()
    destroyHls(); const fb = (track as any).fallbackUrl
    if (fb) applyTrackSource(fb, new URL(fb, window.location.origin).toString(), autoplay)
  })
  if (audio.src) audio.removeAttribute('src')
  hls.attachMedia(audio)
  hls.loadSource(track.streamUrl)
  if (autoplay) requestImmediatePlayback()
}
function attachTrackSource(track: GlobalPlayerTrack, autoplay: boolean) {
  const playbackUrl = getTrackPlaybackUrl(track)
  const targetUrl = new URL(playbackUrl, window.location.origin).toString()
  const requestToken = ++sourceLoadToken
  pendingAutoplay = autoplay
  if (track.streamUrl) {
    if (canUseNativeHls(track)) {
      destroyHls(); if (audio.src !== targetUrl) { audio.src = track.streamUrl; audio.load() }
      if (autoplay) requestImmediatePlayback(); flushPendingAutoplay(); return
    }
    return attachHlsTrack(track, autoplay, requestToken)
  }
  applyTrackSource(playbackUrl, targetUrl, autoplay)
}
function syncOrderPosition(index: number) {
  if (!state.queue) return
  if (!state.shuffleEnabled) return setState('orderPos', index)
  const existingPos = state.playOrder.indexOf(index)
  if (existingPos >= 0) return setState('orderPos', existingPos)
  setState('playOrder', buildShuffledOrder(state.queue.tracks.length, index)); setState('orderPos', 0)
}
function loadTrack(index: number, autoplay: boolean) {
  const track = state.queue?.tracks[index]; if (!state.queue || !track) return
  setState('currentIndex', index); setState('duration', typeof track.duration === 'number' ? track.duration : 0); setState('bufferedTime', 0)
  attachTrackSource(track, autoplay); syncOrderPosition(index)
}
function loadByOrderPos(targetOrderPos: number, autoplay: boolean) {
  const targetIndex = state.playOrder[targetOrderPos]; if (typeof targetIndex !== 'number') return
  setState('orderPos', targetOrderPos); loadTrack(targetIndex, autoplay)
}
function generateWrappedOrder(anchorIndex?: number) {
  if (!state.queue) return []
  return state.shuffleEnabled ? buildShuffledOrder(state.queue.tracks.length, anchorIndex) : buildSequentialOrder(state.queue.tracks.length)
}
function moveToNextTrack(autoplay: boolean) {
  if (!state.queue || state.queue.tracks.length === 0) return
  if (state.repeatMode === 'one') { audio.currentTime = 0; if (autoplay) void audio.play().catch(() => setState('playing', false)); return }
  const nextPos = state.orderPos + 1
  if (nextPos < state.playOrder.length) return loadByOrderPos(nextPos, autoplay)
  if (state.repeatMode === 'all') {
    const wrapped = generateWrappedOrder(); if (wrapped.length === 0) return
    setState('playOrder', wrapped); setState('orderPos', 0); return loadTrack(wrapped[0], autoplay)
  }
  setState('playing', false)
}
function attachListeners() {
  if (listenersAttached) return
  const updateBufferedTime = () => {
    let bufferedEnd = 0; const current = audio.currentTime || 0
    try {
      const ranges = audio.buffered
      if (ranges && ranges.length > 0) {
        for (let i=0;i<ranges.length;i+=1) { const start = ranges.start(i); const end = ranges.end(i); bufferedEnd = Math.max(bufferedEnd, end); if (current >= start && current <= end) { bufferedEnd = end; break } }
      }
    } catch { bufferedEnd = 0 }
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0
    if (duration > 0) bufferedEnd = clamp(bufferedEnd, 0, duration)
    setState('bufferedTime', bufferedEnd)
  }
  audio.addEventListener('timeupdate', () => { setState('currentTime', audio.currentTime || 0); updateBufferedTime(); const bucket=Math.floor(state.currentTime/5); if (bucket!==lastPersistedPlaybackBucket){lastPersistedPlaybackBucket=bucket; schedulePersist()} })
  audio.addEventListener('loadedmetadata', () => { setState('duration', Number.isFinite(audio.duration)?audio.duration:0); updateBufferedTime(); if (pendingRestoreTime != null && Number.isFinite(audio.duration) && audio.duration>0){ const nextTime = clamp(pendingRestoreTime,0,audio.duration); audio.currentTime=nextTime; setState('currentTime', nextTime); pendingRestoreTime = null } })
  audio.addEventListener('progress', updateBufferedTime)
  audio.addEventListener('canplay', flushPendingAutoplay)
  audio.addEventListener('play', () => { setState('playing', true); setState('hasStartedPlayback', true) })
  audio.addEventListener('pause', () => { setState('playing', false); persistState() })
  audio.addEventListener('ended', () => { moveToNextTrack(true); persistState() })
  listenersAttached = true
}
function restorePersistedState() {
  if (typeof window === 'undefined' || hasRestoredState) return
  hasRestoredState = true
  const persisted = readPersistedPlayerState(); if (!persisted?.queueKey) return
  const token = ++restoreLoadToken
  void buildQueueFromReleaseSlug(persisted.queueKey).then((queue) => {
    if (token !== restoreLoadToken || !queue || queue.tracks.length===0 || state.queue) return
    setState('queue', queue)
    setState('currentIndex', clamp(persisted.currentIndex ?? 0, 0, Math.max(queue.tracks.length - 1, 0)))
    setState('currentTime', Math.max(0, persisted.currentTime || 0))
    setState('duration', typeof queue.tracks[state.currentIndex]?.duration === 'number' ? (queue.tracks[state.currentIndex]?.duration as number) : 0)
    setState('volume', clamp(persisted.volume ?? 1, 0, 1)); setState('muted', Boolean(persisted.muted)); setState('shuffleEnabled', Boolean(persisted.shuffleEnabled)); setState('repeatMode', persisted.repeatMode === 'all' || persisted.repeatMode === 'one' ? persisted.repeatMode : 'off'); setState('hasStartedPlayback', Boolean(persisted.hasStartedPlayback))
    const validOrder = Array.isArray(persisted.playOrder) && persisted.playOrder.length===queue.tracks.length && persisted.playOrder.every((v)=>Number.isInteger(v)&&v>=0&&v<queue.tracks.length)
    const order = validOrder ? [...persisted.playOrder] : state.shuffleEnabled ? buildShuffledOrder(queue.tracks.length, state.currentIndex) : buildSequentialOrder(queue.tracks.length)
    setState('playOrder', order)
    setState('orderPos', clamp(validOrder ? persisted.orderPos ?? order.indexOf(state.currentIndex) : order.indexOf(state.currentIndex), 0, Math.max(order.length - 1, 0)))
    setState('trackDurations', Object.fromEntries(queue.tracks.map((t)=>[getTrackPlaybackUrl(t), t.duration]).filter((e): e is [string, number] => typeof e[1] === 'number')))
    pendingRestoreTime = state.currentTime
    attachTrackSource(queue.tracks[state.currentIndex], Boolean(persisted.wasPlaying))
  }).catch(() => clearPersistedPlayerState())
}

export function usePlayer() {
  attachListeners(); restorePersistedState()
  const currentTrack = createMemo(() => state.queue?.tracks[state.currentIndex] ?? null)
  const upcomingTracks = createMemo<UpcomingTrack[]>(() => {
    if (!state.queue || state.playOrder.length === 0) return []
    const tail = state.playOrder.slice(state.orderPos + 1)
    const indices = state.repeatMode === 'all' ? [...tail, ...state.playOrder.slice(0, state.orderPos)] : tail
    return indices.slice(0,24).map((index) => {
      const track = state.queue!.tracks[index]
      const playbackUrl = getTrackPlaybackUrl(track)
      return { index, track, duration: typeof state.trackDurations[playbackUrl] === 'number' ? state.trackDurations[playbackUrl] : null }
    })
  })
  return {
    state,
    currentTrack,
    upcomingTracks,
    setQueue: (nextQueue: GlobalPlayerQueue) => {
      if (state.queue && state.queue.queueKey === nextQueue.queueKey) return
      audio.pause(); destroyHls(); setState('queue', nextQueue)
      const order = state.shuffleEnabled ? buildShuffledOrder(nextQueue.tracks.length, 0) : buildSequentialOrder(nextQueue.tracks.length)
      setState('playOrder', order); setState('currentIndex', order[0] ?? 0); setState('orderPos', 0); setState('currentTime', 0); setState('duration', 0); setState('bufferedTime', 0); setState('playing', false)
      setState('trackDurations', Object.fromEntries(nextQueue.tracks.map((t)=>[getTrackPlaybackUrl(t), t.duration]).filter((e): e is [string, number] => typeof e[1] === 'number')))
      audio.removeAttribute('src'); audio.load(); lastPersistedPlaybackBucket = -1
    },
    togglePlayPause: () => { if (!state.queue?.tracks[state.currentIndex]) return; if (audio.paused) requestImmediatePlayback(); else audio.pause() },
    playTrack: (index: number) => { if (!state.queue || index < 0 || index >= state.queue.tracks.length) return; if (state.shuffleEnabled) { setState('playOrder', buildShuffledOrder(state.queue.tracks.length, index)); setState('orderPos', 0) } loadTrack(index, true) },
    nextTrack: () => moveToNextTrack(true),
    prevTrack: () => { if (audio.currentTime > 3) { audio.currentTime = 0; return } const prevPos = state.orderPos - 1; if (prevPos >= 0) return loadByOrderPos(prevPos, true); if (state.repeatMode === 'all') return loadByOrderPos(Math.max(0, state.playOrder.length - 1), true); audio.currentTime = 0 },
    seekByRatio: (ratio: number) => { const length = Number.isFinite(audio.duration) ? audio.duration : 0; if (!length) return; const next = clamp(ratio,0,1)*length; audio.currentTime = next; setState('currentTime', next) },
    setVolume: (value: number) => { const next = clamp(value,0,1); setState('volume', next); if (next > 0 && state.muted) setState('muted', false) },
    toggleMute: () => setState('muted', (m) => !m),
    toggleShuffle: () => { if (!state.queue) return; const next = !state.shuffleEnabled; setState('shuffleEnabled', next); if (next) { setState('playOrder', buildShuffledOrder(state.queue.tracks.length, state.currentIndex)); setState('orderPos', 0) } else { setState('playOrder', buildSequentialOrder(state.queue.tracks.length)); setState('orderPos', state.currentIndex) } },
    cycleRepeatMode: () => setState('repeatMode', state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off'),
    clearPlayer: () => { audio.pause(); destroyHls(); audio.removeAttribute('src'); audio.load(); pendingRestoreTime = null; setState({ queue: null, currentIndex: 0, playing: false, currentTime: 0, duration: 0, bufferedTime: 0, hasStartedPlayback: false, playOrder: [], orderPos: 0, trackDurations: {} }); lastPersistedPlaybackBucket=-1; persistState() },
  }
}
