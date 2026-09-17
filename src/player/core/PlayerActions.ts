import { buildSequentialOrder, buildShuffledOrder, clamp } from '../order.js'
import { getAudioEngine } from '@/lib/audio/audio-engine.js'
import { getTrackPlaybackUrl } from '../api/StreamApi.js'
import type { PlayerStateManager } from './PlayerState.js'
import type { PlayerEngine } from './PlayerEngine.js'
import type { GlobalPlayerQueue } from '../types.js'

function syncOrderPosition(state: PlayerStateManager, _engine: PlayerEngine) {
  if (!state.state.queue) return
  if (!state.state.shuffleEnabled) { state.updateField('orderPos', state.state.currentIndex); return }
  const existingPos = state.state.playOrder.indexOf(state.state.currentIndex)
  if (existingPos >= 0) { state.updateField('orderPos', existingPos); return }
  const order = buildShuffledOrder(state.state.queue.tracks.length, state.state.currentIndex)
  state.updateField('playOrder', order)
  state.updateField('orderPos', 0)
}

function generateWrappedOrder(state: PlayerStateManager) {
  if (!state.state.queue) return []
  return state.state.shuffleEnabled
    ? buildShuffledOrder(state.state.queue.tracks.length, state.state.currentIndex)
    : buildSequentialOrder(state.state.queue.tracks.length)
}

function loadTrack(state: PlayerStateManager, engine: PlayerEngine, index: number, autoplay: boolean) {
  engine.audioEngineManager.streamOffset = 0
  engine.savedTrackDuration = null
  const track = state.state.queue?.tracks[index]
  if (!state.state.queue || !track) return
  state.updateField('currentIndex', index)
  state.updateField('duration', typeof track.duration === 'number' ? track.duration : 0)
  state.updateField('bufferedTime', 0)
  void engine.attachTrackSource(track, state.state.queue, autoplay)
  syncOrderPosition(state, engine)
}

function loadByOrderPos(state: PlayerStateManager, engine: PlayerEngine, targetOrderPos: number, autoplay: boolean) {
  const targetIndex = state.state.playOrder[targetOrderPos]
  if (typeof targetIndex !== 'number') return
  state.updateField('orderPos', targetOrderPos)
  loadTrack(state, engine, targetIndex, autoplay)
}

export function moveToNextTrack(state: PlayerStateManager, engine: PlayerEngine, autoplay: boolean) {
  if (!state.state.queue || state.state.queue.tracks.length === 0) return
  if (state.state.repeatMode === 'one') {
    engine.replayTrack()
    if (autoplay) {
      getAudioEngine().resume()
      void engine.audio.play().catch(() => state.setPlaying(false))
    }
    return
  }
  const nextPos = state.state.orderPos + 1
  if (nextPos < state.state.playOrder.length) return loadByOrderPos(state, engine, nextPos, autoplay)
  if (state.state.repeatMode === 'all') {
    const wrapped = generateWrappedOrder(state)
    if (wrapped.length === 0) return
    state.updateField('playOrder', wrapped)
    state.updateField('orderPos', 0)
    loadTrack(state, engine, wrapped[0], autoplay)
    return
  }
  state.setPlaying(false)
}

function queueSignature(queue: GlobalPlayerQueue): string {
  return queue.tracks.map((t) => t.index).join(',')
}

export function setQueue(state: PlayerStateManager, engine: PlayerEngine, nextQueue: GlobalPlayerQueue) {
  const prev = state.state.queue
  // Identical queue content (same slug, same track list) → keep playback state.
  if (prev && prev.queueKey === nextQueue.queueKey && queueSignature(prev) === queueSignature(nextQueue)) return
  // Same release but changed availability (e.g. pre-order flags flipped):
  // replace the stale queue and carry the current track over when still available.
  const prevTrackIndex = prev && prev.queueKey === nextQueue.queueKey
    ? prev.tracks[state.state.currentIndex]?.index
    : undefined
  const preservedPos = typeof prevTrackIndex === 'number'
    ? nextQueue.tracks.findIndex((t) => t.index === prevTrackIndex)
    : -1

  engine.pause()
  engine.hlsManager.destroy()
  engine.audioEngineManager.streamOffset = 0
  state.setQueue(nextQueue)
  const startIndex = preservedPos >= 0 ? preservedPos : 0
  const startTrack = nextQueue.tracks[startIndex]
  const order = state.state.shuffleEnabled
    ? buildShuffledOrder(nextQueue.tracks.length, startIndex)
    : buildSequentialOrder(nextQueue.tracks.length)
  state.setState({
    playOrder: order,
    currentIndex: startIndex,
    orderPos: state.state.shuffleEnabled ? 0 : startIndex,
    currentTime: 0,
    duration: typeof startTrack?.duration === 'number' ? startTrack.duration : 0,
    bufferedTime: 0,
    playing: false,
    trackDurations: Object.fromEntries(
      nextQueue.tracks
        .map((t) => [getTrackPlaybackUrl(t, nextQueue), t.duration] as [string, number | null])
        .filter((e): e is [string, number] => typeof e[1] === 'number'),
    ),
  })
  engine.loadBlank()
  engine.lastPersistedPlaybackBucket = -1
}

export function playTrack(state: PlayerStateManager, engine: PlayerEngine, index: number) {
  if (!state.state.queue || index < 0 || index >= state.state.queue.tracks.length) return
  if (state.state.shuffleEnabled) {
    const order = buildShuffledOrder(state.state.queue.tracks.length, index)
    state.updateField('playOrder', order)
    state.updateField('orderPos', 0)
  }
  loadTrack(state, engine, index, true)
}

export function nextTrack(state: PlayerStateManager, engine: PlayerEngine) {
  moveToNextTrack(state, engine, true)
}

export function prevTrack(state: PlayerStateManager, engine: PlayerEngine) {
  const a = engine.audio
  if (a.currentTime > 3) {
    engine.audioEngineManager.streamOffset = 0
    a.currentTime = 0
    return
  }
  const prevPos = state.state.orderPos - 1
  if (prevPos >= 0) return loadByOrderPos(state, engine, prevPos, true)
  if (state.state.repeatMode === 'all') return loadByOrderPos(state, engine, Math.max(0, state.state.playOrder.length - 1), true)
  engine.audioEngineManager.streamOffset = 0
  a.currentTime = 0
}

export function seekByRatio(state: PlayerStateManager, engine: PlayerEngine, ratio: number) {
  const length = state.state.duration
  if (!length) return
  const next = clamp(ratio, 0, 1) * length
  const track = state.state.queue?.tracks[state.state.currentIndex]
  const slug = state.state.queue?.queueKey
  const quality = getAudioEngine().state.quality
  if (slug && track && quality !== 'medium' && quality !== 'superb') {
    engine.seekByQualityStream(slug, track, ratio, length, state.state.playing)
    state.setCurrentTime(engine.audioEngineManager.streamOffset)
    return
  }
  engine.currentTime = next
  state.setCurrentTime(next)
}

export function togglePlayPause(state: PlayerStateManager, engine: PlayerEngine) {
  if (!state.state.queue?.tracks[state.state.currentIndex]) return
  if (engine.paused) {
    engine.audioEngineManager.requestImmediatePlayback()
  } else {
    engine.pause()
  }
}

export function clearPlayer(state: PlayerStateManager, engine: PlayerEngine) {
  engine.pause()
  engine.hlsManager.destroy()
  engine.loadBlank()
  engine.pendingRestoreTime = null
  engine.audioEngineManager.streamOffset = 0
  state.setState({
    queue: null,
    currentIndex: 0,
    playing: false,
    currentTime: 0,
    duration: 0,
    bufferedTime: 0,
    hasStartedPlayback: false,
    playOrder: [],
    orderPos: 0,
    trackDurations: {},
  })
  engine.lastPersistedPlaybackBucket = -1
}
