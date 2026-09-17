import type { PlayerState, RepeatMode, GlobalPlayerQueue } from '../types.js'

const INITIAL_STATE: PlayerState = {
  queue: null,
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
  playOrder: [],
  orderPos: 0,
  trackDurations: {},
  radioActive: false,
  radioTrack: null,
}

export class PlayerStateManager {
  private _state: PlayerState = { ...INITIAL_STATE }
  private listeners = new Map<string, Set<() => void>>()
  private allListeners = new Set<() => void>()

  get state(): PlayerState {
    return this._state
  }

  subscribe(slice: string, fn: () => void): () => void {
    let set = this.listeners.get(slice)
    if (!set) {
      set = new Set()
      this.listeners.set(slice, set)
    }
    set.add(fn)
    return () => { set?.delete(fn) }
  }

  subscribeAll(fn: () => void): () => void {
    this.allListeners.add(fn)
    return () => this.allListeners.delete(fn)
  }

  notify(slice: string) {
    this.listeners.get(slice)?.forEach(fn => fn())
    this.allListeners.forEach(fn => fn())
  }

  updateField<K extends keyof PlayerState>(key: K, value: PlayerState[K]) {
    this._state[key] = value
    this.notify(key)
  }

  setState(partial: Partial<PlayerState>) {
    const keys = Object.keys(partial) as (keyof PlayerState)[]
    for (const key of keys) {
      (this._state as Record<keyof PlayerState, unknown>)[key] = partial[key]
    }
    for (const key of keys) {
      this.notify(key)
    }
  }

  setQueue(queue: GlobalPlayerQueue | null) {
    this._state.queue = queue
    this.notify('queue')
  }

  setCurrentTime(time: number) {
    this._state.currentTime = time
    this.notify('currentTime')
  }

  setPlaying(playing: boolean) {
    this._state.playing = playing
    this.notify('playing')
  }

  setDuration(duration: number) {
    this._state.duration = duration
    this.notify('duration')
  }

  setBufferedTime(time: number) {
    this._state.bufferedTime = time
    this.notify('bufferedTime')
  }
}
