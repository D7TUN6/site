import type { AudioEngineState } from './types.js'

const DEFAULT_STATE: AudioEngineState = {
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqPreset: 'manual',
  autoEqModel: null,
  autoEqFilters: [],
  tapeEnabled: false,
  tapeSaturation: 0.5,
  cassetteType: 'type_ii',
  tapeBias: 0.5,
  tapeNoise: 0.3,
  tapeWow: 0.5,
  tapeFlutter: 0.5,
  deckMechanism: 'technics',
  tanashinWear: 0,
  dolbyC: false,
  reverbEnabled: false,
  reverbMix: 0.3,
  quality: 'medium',
  bitcrusherEnabled: false,
  bitDepth: 8,
  reduction: 2,
  combEnabled: false,
  combDelayMs: 3,
  combResonance: 0.5,
  chorusEnabled: false,
  chorusRate: 1,
  chorusDepth: 0.5,
  chorusMix: 0.5,
  delayEnabled: false,
  delayTime: 0.3,
  delayFeedback: 0.4,
  delayMix: 0.5,
  normalizationMode: 'standard',
}

export class AudioStateManager {
  private _state: AudioEngineState = { ...DEFAULT_STATE }
  private _listeners: Set<(state: AudioEngineState) => void> = new Set()
  private _saveTimer: ReturnType<typeof setTimeout> | null = null

  get state(): Readonly<AudioEngineState> {
    return this._state
  }

  subscribe(fn: (state: AudioEngineState) => void): () => void {
    this._listeners.add(fn)
    fn({ ...this._state })
    return () => this._listeners.delete(fn)
  }

  emit(): void {
    const s = { ...this._state }
    for (const fn of this._listeners) fn(s)
  }

  persist(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      try {
        localStorage.setItem('audio-engine-state', JSON.stringify(this._state))
      } catch {
        console.warn('Failed to persist audio engine state')
      }
    }, 300)
  }

  reset(): void {
    this._state = { ...DEFAULT_STATE }
    this._listeners.clear()
  }

  getRawState(): AudioEngineState {
    return this._state
  }
}
