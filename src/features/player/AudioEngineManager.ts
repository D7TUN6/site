import { clamp } from '@/player/order.js'
import { getAudioEngine } from '@/lib/audio/audio-engine.js'

export class AudioEngineManager {
  readonly #audio: HTMLAudioElement
  readonly #supportsOggOpus: boolean
  readonly #supportsNativeHls: boolean
  #playRequestInFlight = false
  #pendingAutoplay = false
  #listenersAttached = false
  #streamOffset = 0
  #internalReload = false

  get playRequestInFlight() { return this.#playRequestInFlight }
  set playRequestInFlight(v: boolean) { this.#playRequestInFlight = v }
  get pendingAutoplay() { return this.#pendingAutoplay }
  set pendingAutoplay(v: boolean) { this.#pendingAutoplay = v }
  get listenersAttached() { return this.#listenersAttached }
  set listenersAttached(v: boolean) { this.#listenersAttached = v }
  get streamOffset() { return this.#streamOffset }
  set streamOffset(v: number) { this.#streamOffset = v }
  // True while a radio stream is being re-loaded internally (stall/error
  // recovery). The <audio> element may emit a transient `pause` during
  // load(); the bridge must not let that flip the UI's play/pause state.
  get internalReload() { return this.#internalReload }
  set internalReload(v: boolean) { this.#internalReload = v }
  get supportsOggOpus() { return this.#supportsOggOpus }
  get supportsNativeHls() { return this.#supportsNativeHls }

  constructor() {
    this.#audio = new Audio()
    this.#audio.preload = 'metadata'
    this.#audio.crossOrigin = 'anonymous'
    this.#audio.volume = 1
    this.#audio.muted = false
    this.#supportsOggOpus = this.#audio.canPlayType('audio/ogg; codecs="opus"') !== ''
    this.#supportsNativeHls = this.#audio.canPlayType('application/vnd.apple.mpegurl') !== ''
  }

  getAudioElement(): HTMLAudioElement {
    return this.#audio
  }

  canUseNativeHls(track: { streamUrl?: string | null }): boolean {
    return Boolean(track.streamUrl && this.#supportsNativeHls)
  }

  initEngine() {
    const engine = getAudioEngine()
    engine.init(this.#audio)
    engine.loadPersistedSettings()
  }

  attachSource() {
    getAudioEngine().attachSource()
  }

  setMasterGain(gain: number) {
    getAudioEngine().setMasterGain(gain)
  }

  setNormGain(gain: number) {
    getAudioEngine().setNormGain(gain)
  }

  async requestImmediatePlayback(): Promise<void> {
    if (this.#playRequestInFlight) return
    this.#playRequestInFlight = true
    try {
      const engine = getAudioEngine()
      if (!engine.prepareForPlayback()) return
      const playPromise = this.#audio.play()
      await engine.resume()
      await playPromise
    } catch {
      console.warn('Failed to request immediate playback')
    } finally {
      this.#playRequestInFlight = false
    }
  }

  flushPendingAutoplay() {
    if (!this.#pendingAutoplay) return
    this.#pendingAutoplay = false
    void this.requestImmediatePlayback()
  }

  computeBufferedTime(): number {
    let bufferedEnd = 0
    const current = this.#audio.currentTime || 0
    try {
      const ranges = this.#audio.buffered
      if (ranges && ranges.length > 0) {
        for (let i = 0; i < ranges.length; i += 1) {
          const start = ranges.start(i)
          const end = ranges.end(i)
          bufferedEnd = Math.max(bufferedEnd, end)
          if (current >= start && current <= end) {
            bufferedEnd = end
            break
          }
        }
      }
    } catch {
      console.warn('Failed to compute buffered time')
      bufferedEnd = 0
    }
    const duration = Number.isFinite(this.#audio.duration) ? this.#audio.duration : 0
    if (duration > 0) bufferedEnd = clamp(bufferedEnd, 0, duration)
    return this.#streamOffset + bufferedEnd
  }
}
