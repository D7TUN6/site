import type { AudioEngineManager } from './AudioEngineManager.js'

export const RADIO_STREAM_URL = '/api/radio/stream'

// How long after an internal reload transient `pause` events are ignored.
const RELOAD_GUARD_MS = 2_000
const BACKOFF_BASE_MS = 500
const BACKOFF_MAX_MS = 10_000
// ~9 minutes of exponential backoff before giving up on a dead stream; a
// successful reconnect resets attempts, and RadioPage refresh restarts it.
const MAX_ATTEMPTS = 60

/**
 * Native <audio> player for the live Ogg Icecast stream (server proxies
 * /api/radio/stream → loopback Icecast). hls.js is out of the radio path: a
 * plain src load gives us gapless live playback, and reconnects just reload
 * the same URL on stall/error/ended with exponential backoff.
 *
 * The element is the shared one from AudioEngineManager (crossOrigin=anonymous,
 * fed into the WebAudio DSP graph via createMediaElementSource) — reconnects
 * must re-load the *same* element through load()/play(), never recreate it, or
 * the AudioContext source would break the visualizer chain.
 */
export class RadioStreamEngine {
  readonly #audio: HTMLAudioElement
  readonly #aem: AudioEngineManager
  readonly #resumeCheck?: () => boolean
  #reconnectTimer: number | null = null
  #reloadGuardTimer: number | null = null
  #backoffMs = BACKOFF_BASE_MS
  #attempts = 0
  #disposed = false
  #listeners: Array<[string, EventListener]> = []

  constructor(audio: HTMLAudioElement, aem: AudioEngineManager, resumeCheck?: () => boolean) {
    this.#audio = audio
    this.#aem = aem
    this.#resumeCheck = resumeCheck
  }

  get supported(): boolean {
    return this.#audio.canPlayType('audio/ogg; codecs=vorbis') !== '' || this.#audio.canPlayType('audio/ogg') !== ''
  }

  attach(): boolean {
    if (!this.supported) {
      console.warn('radio: ogg vorbis playback unsupported in this browser')
      return false
    }
    this.#disposed = false
    this.#attempts = 0
    this.#backoffMs = BACKOFF_BASE_MS
    this.#aem.pendingAutoplay = true
    if (this.#audio.src !== RADIO_STREAM_URL) {
      this.#armReloadGuard()
      this.#audio.src = RADIO_STREAM_URL
      this.#audio.load()
    }
    this.#aem.attachSource()
    void this.#aem.requestImmediatePlayback()
    this.#aem.flushPendingAutoplay()
    this.#bindListeners()
    return true
  }

  reconnect() {
    this.#reconnectTimer = null
    if (this.#disposed) return
    this.#attempts += 1
    this.#aem.pendingAutoplay = true
    if (this.#audio.src !== RADIO_STREAM_URL) this.#audio.src = RADIO_STREAM_URL
    this.#armReloadGuard()
    this.#audio.load()
    void this.#aem.requestImmediatePlayback()
  }

  // An internal reload can make the media element emit a spurious `pause`
  // before the new stream starts. Flag the window so the global bridge keeps
  // the UI in the "playing" state instead of flickering listen/stop.
  #armReloadGuard() {
    this.#aem.internalReload = true
    if (this.#reloadGuardTimer !== null) clearTimeout(this.#reloadGuardTimer)
    this.#reloadGuardTimer = window.setTimeout(() => {
      this.#reloadGuardTimer = null
      this.#aem.internalReload = false
    }, RELOAD_GUARD_MS)
  }

  #scheduleReconnect() {
    if (this.#disposed || this.#reconnectTimer !== null) return
    if (this.#resumeCheck && !this.#resumeCheck()) return
    if (this.#attempts >= MAX_ATTEMPTS) return
    this.#reconnectTimer = window.setTimeout(() => this.reconnect(), this.#backoffMs)
    this.#backoffMs = Math.min(this.#backoffMs * 2, BACKOFF_MAX_MS)
  }

  #onMediaEvent = () => {
    // Only treat it as a failure when we are expected to be playing or trying
    // to — a paused radio that errors should not fight the user.
    if (this.#disposed) return
    if (this.#audio.paused && this.#resumeCheck) return
    this.#scheduleReconnect()
  }

  // A live stream can report `stalled` while the element still has playable
  // data buffered (the browser briefly stops fetching). Reloading in that case
  // causes a needless reconnect loop, so only react when the buffer is dry.
  #onStalled = () => {
    if (this.#disposed) return
    if (this.#audio.paused && this.#resumeCheck) return
    if (this.#audio.readyState >= 2 /* HAVE_CURRENT_DATA */) return
    this.#scheduleReconnect()
  }

  #onPlaying = () => {
    // The stream came back / started cleanly — shrink the backoff and reset the
    // attempt counter so a future outage gets a full fresh reconnect budget.
    this.#backoffMs = BACKOFF_BASE_MS
    this.#attempts = 0
  }

  #bindListeners() {
    this.#unbindListeners()
    for (const ev of ['error', 'ended'] as const) {
      this.#audio.addEventListener(ev, this.#onMediaEvent)
      this.#listeners.push([ev, this.#onMediaEvent])
    }
    this.#audio.addEventListener('stalled', this.#onStalled)
    this.#listeners.push(['stalled', this.#onStalled])
    this.#audio.addEventListener('playing', this.#onPlaying)
    this.#listeners.push(['playing', this.#onPlaying])
  }

  #unbindListeners() {
    for (const [ev, fn] of this.#listeners) this.#audio.removeEventListener(ev, fn)
    this.#listeners = []
  }

  dispose() {
    this.#disposed = true
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
    if (this.#reloadGuardTimer !== null) {
      clearTimeout(this.#reloadGuardTimer)
      this.#reloadGuardTimer = null
    }
    this.#aem.internalReload = false
    this.#unbindListeners()
  }
}
