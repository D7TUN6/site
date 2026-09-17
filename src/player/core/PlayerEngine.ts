import { getAudioEngine } from '@/lib/audio/audio-engine.js'
import { HlsManager } from '@/features/player/HlsManager.js'
import { AudioEngineManager } from '@/features/player/AudioEngineManager.js'
import { RadioStreamEngine } from '@/features/player/RadioStreamEngine.js'
import { getTrackPlaybackUrl, buildSeekUrl } from '../api/StreamApi.js'
import type { GlobalPlayerTrack, GlobalPlayerQueue } from '../types.js'

export class PlayerEngine {
  hlsManager: HlsManager
  audioEngineManager: AudioEngineManager
  audio: HTMLAudioElement
  radioStream: RadioStreamEngine | null = null
  savedTrackDuration: number | null = null
  pendingRestoreTime: number | null = null
  sourceLoadToken = 0
  lastPersistedPlaybackBucket = -1
  /** Consecutive audio-element errors without successful playback — guards against infinite skip loops. */
  consecutiveAudioErrors = 0

  constructor() {
    this.audioEngineManager = new AudioEngineManager()
    this.audio = this.audioEngineManager.getAudioElement()
    this.hlsManager = new HlsManager()
  }

  private destroyHls() {
    this.hlsManager.destroy()
    this.audioEngineManager.pendingAutoplay = false
    this.audioEngineManager.playRequestInFlight = false
  }

  /**
   * Start the live radio stream on the shared <audio> element. Native Ogg
   * playback — no hls.js involved. Reconnects after server/network hiccups are
   * owned by the RadioStreamEngine (backoff reload of the same source).
   * `resumeCheck` tells the engine whether it may auto-resume after an error
   * (i.e. the user is actually listening, not paused/stopped).
   */
  attachRadioStream(resumeCheck?: () => boolean): Promise<boolean> {
    this.audioEngineManager.streamOffset = 0
    this.savedTrackDuration = null
    ++this.sourceLoadToken
    this.destroyHls()
    this.radioStream?.dispose()
    this.radioStream = new RadioStreamEngine(this.audio, this.audioEngineManager, resumeCheck)
    return Promise.resolve(this.radioStream.attach())
  }

  teardownRadioStream() {
    this.radioStream?.dispose()
    this.radioStream = null
    this.destroyHls()
  }

  private applyTrackSource(playbackUrl: string, targetUrl: string, autoplay: boolean) {
    this.destroyHls()
    if (this.audio.src !== targetUrl) { this.audio.src = playbackUrl; this.audio.load() }
    this.audioEngineManager.attachSource()
    if (autoplay) void this.audioEngineManager.requestImmediatePlayback()
    this.audioEngineManager.flushPendingAutoplay()
  }

  async attachTrackSource(track: GlobalPlayerTrack, queue: GlobalPlayerQueue | null, autoplay: boolean) {
    const playbackUrl = getTrackPlaybackUrl(track, queue)
    const targetUrl = new URL(playbackUrl, window.location.origin).toString()
    ++this.sourceLoadToken
    this.audioEngineManager.pendingAutoplay = autoplay
    if (track.streamUrl && playbackUrl === track.streamUrl) {
      if (this.audioEngineManager.canUseNativeHls(track)) {
        this.destroyHls()
        if (this.audio.src !== targetUrl) { this.audio.src = track.streamUrl; this.audio.load() }
        this.audioEngineManager.attachSource()
        if (autoplay) void this.audioEngineManager.requestImmediatePlayback()
        this.audioEngineManager.flushPendingAutoplay()
        return
      }
      this.destroyHls()
      const usedHls = await this.hlsManager.attachHlsTrack(
        track,
        this.audio,
        () => this.audioEngineManager.flushPendingAutoplay(),
        (url: string) => this.applyTrackSource(url, new URL(url, window.location.origin).toString(), autoplay),
      )
      if (usedHls) {
        this.audioEngineManager.attachSource()
        if (autoplay) void this.audioEngineManager.requestImmediatePlayback()
      }
      return
    }
    this.applyTrackSource(playbackUrl, targetUrl, autoplay)
  }

  seekByQualityStream(slug: string, track: GlobalPlayerTrack, ratio: number, duration: number, playing: boolean) {
    const quality = getAudioEngine().state.quality
    const next = ratio * duration
    const url = buildSeekUrl(slug, track.index, quality, next)
    this.audioEngineManager.streamOffset = next
    this.consecutiveAudioErrors = 0
    if (playing) this.audio.pause()
    this.destroyHls()
    this.audio.src = url
    this.audio.load()
    getAudioEngine().attachSource()
    if (playing) void this.audioEngineManager.requestImmediatePlayback()
  }

  replayTrack() {
    this.audioEngineManager.streamOffset = 0
    this.audio.currentTime = 0
  }

  loadBlank() {
    this.audio.removeAttribute('src')
    this.audio.load()
  }

  pause() {
    this.audio.pause()
  }

  get currentTime(): number {
    return this.audio.currentTime || 0
  }

  set currentTime(val: number) {
    this.audio.currentTime = val
  }

  get paused(): boolean {
    return this.audio.paused
  }

  get audioDuration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }
}
