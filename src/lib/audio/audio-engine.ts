import {
  type ProfileFilter,
  type EqPresetName,
  type Quality,
  type CassetteType,
  type DeckType,
  type AudioEngineState,
  EQ_FREQUENCIES,
  EQ_PRESETS,
} from './types.js'
import { AudioStateManager } from './AudioStateManager.js'
import { BitcrusherProcessor } from './BitcrusherProcessor.js'
import { DelayProcessor } from './DelayProcessor.js'
import { EqProcessor } from './EqProcessor.js'
import { DeckProcessor } from './DeckProcessor.js'
import { TapeProcessor } from './TapeProcessor.js'
import { ReverbProcessor } from './ReverbProcessor.js'
import { buildPluginChain } from './plugin-registry.js'

export type { ProfileFilter, EqPresetName, Quality, CassetteType, DeckType, AudioEngineState }
export { EQ_FREQUENCIES }

// ── Setter Config ──

type ProcName = 'bitcrusherProc' | 'delayProc' | 'deckProc' | 'eqProc' | 'tapeProc' | 'reverbProc'
type ClampSpec = [number, number] | 'boolean'

type SetterSpec = {
  key: keyof AudioEngineState
  proc: ProcName | ProcName[]
  clamp?: ClampSpec
  round?: boolean
}

const SETTER_SPECS: Record<string, SetterSpec> = {
  setTapeEnabled: { key: 'tapeEnabled', proc: ['tapeProc', 'deckProc'], clamp: 'boolean' },
  setTapeSaturation: { key: 'tapeSaturation', proc: 'tapeProc', clamp: [0, 1] },
  setCassetteType: { key: 'cassetteType', proc: 'tapeProc' },
  setTapeBias: { key: 'tapeBias', proc: 'tapeProc', clamp: [0, 1] },
  setTapeNoise: { key: 'tapeNoise', proc: 'tapeProc', clamp: [0, 1] },
  setTapeWow: { key: 'tapeWow', proc: 'deckProc', clamp: [0, 1] },
  setTapeFlutter: { key: 'tapeFlutter', proc: 'deckProc', clamp: [0, 1] },
  setDeckMechanism: { key: 'deckMechanism', proc: 'deckProc' },
  setDolbyC: { key: 'dolbyC', proc: 'deckProc', clamp: 'boolean' },
  setReverbEnabled: { key: 'reverbEnabled', proc: 'reverbProc', clamp: 'boolean' },
  setReverbMix: { key: 'reverbMix', proc: 'reverbProc', clamp: [0, 1] },
  setBitcrusherEnabled: { key: 'bitcrusherEnabled', proc: 'bitcrusherProc', clamp: 'boolean' },
  setBitDepth: { key: 'bitDepth', proc: 'bitcrusherProc', clamp: [1, 24], round: true },
  setReduction: { key: 'reduction', proc: 'bitcrusherProc', clamp: [1, 64], round: true },
  setCombEnabled: { key: 'combEnabled', proc: 'delayProc', clamp: 'boolean' },
  setCombDelayMs: { key: 'combDelayMs', proc: 'delayProc', clamp: [0.1, 100] },
  setCombResonance: { key: 'combResonance', proc: 'delayProc', clamp: [0, 1] },
  setChorusEnabled: { key: 'chorusEnabled', proc: 'delayProc', clamp: 'boolean' },
  setChorusRate: { key: 'chorusRate', proc: 'delayProc', clamp: [0.1, 20] },
  setChorusDepth: { key: 'chorusDepth', proc: 'delayProc', clamp: [0, 1] },
  setChorusMix: { key: 'chorusMix', proc: 'delayProc', clamp: [0, 1] },
  setDelayEnabled: { key: 'delayEnabled', proc: 'delayProc', clamp: 'boolean' },
  setDelayTime: { key: 'delayTime', proc: 'delayProc', clamp: [0, 1] },
  setDelayFeedback: { key: 'delayFeedback', proc: 'delayProc', clamp: [0, 1] },
  setDelayMix: { key: 'delayMix', proc: 'delayProc', clamp: [0, 1] },
}

const _gcAnchor = new Set<object>()

export class AudioEngine {
  private stateManager = new AudioStateManager()
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private sourceConnected = false
  private _audioElement: HTMLAudioElement | null = null
  private initialized = false
  private graphBuilt = false

  private bitcrusherProc!: BitcrusherProcessor
  private delayProc!: DelayProcessor
  private eqProc!: EqProcessor
  private deckProc!: DeckProcessor
  private tapeProc!: TapeProcessor
  private reverbProc!: ReverbProcessor

  private _killBypass: GainNode | null = null
  private normGain: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private masterGain: GainNode | null = null
  private graphInput: GainNode | null = null
  private masterGainValue = 1
  private normGainValue = 1
  private _killSwitch = false

  get state(): Readonly<AudioEngineState> {
    return this.stateManager.state
  }

  get audioStateManager(): AudioStateManager {
    return this.stateManager
  }

  subscribe(fn: (state: AudioEngineState) => void): () => void {
    return this.stateManager.subscribe(fn)
  }

  private emit(): void {
    this.stateManager.emit()
    this.stateManager.persist()
  }

  init(audioElement: HTMLAudioElement): void {
    if (this.initialized) return
    this._audioElement = audioElement
    this.initialized = true
  }

  ensureContextSync(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume()
      }
      return this.ctx.state !== 'closed'
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return false
    this.ctx = new AC()
    this.graphBuilt = false
    return true
  }

  async resume(): Promise<void> {
    if (!this.ctx || this.ctx.state === 'closed') return
    await this.ensureRunning()
    if (!this.graphBuilt) {
      this.ensureGraphSync()
      this.emit()
    }
  }

  private async ensureRunning(): Promise<void> {
    if (!this.ctx || this.ctx.state === 'closed') return
    if (this.ctx.state !== 'running') {
      await this.ctx.resume()
    }
  }

  async resumeContext(): Promise<void> {
    return this.resume()
  }

  async prepareForPlayback(): Promise<boolean> {
    if (!this.ensureContextSync()) return false
    await this.ensureRunning()
    if (!this.graphBuilt) {
      this.ensureGraphSync()
      this.emit()
    }
    return true
  }

  suspend(): void {
    this.ctx?.suspend()
  }

  destroy(): void {
    this.deckProc?.stopChewTimer()
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close()
    }
    _gcAnchor.clear()
    this.resetRefs()
    this.initialized = false
    this.graphBuilt = false
  }

  private resetRefs(): void {
    this.ctx = null
    this.source = null
    this.sourceConnected = false
    this._audioElement = null

    this.bitcrusherProc?.resetRefs()
    this.delayProc?.resetRefs()
    this.eqProc?.resetRefs()
    this.deckProc?.resetRefs()
    this.tapeProc?.resetRefs()
    this.reverbProc?.resetRefs()

    this._killBypass = null
    this.normGain = null
    this.limiter = null
    this.masterGain = null
    this.graphInput = null
    this.graphBuilt = false
  }

  setMasterGain(value: number): void {
    this.masterGainValue = Math.max(0, Math.min(1, value))
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterGainValue
    }
  }

  // Visualisation tap on the master bus. Returns an AnalyserNode that must be
  // disconnected via the returned fn when the consumer unmounts. Inert when the
  // DSP graph has not been built yet (no playback started), so callers should
  // re-request after 'play'.
  createScopeAnalyser(): { analyser: AnalyserNode; disconnect: () => void } | null {
    if (!this.ctx || this.ctx.state === 'closed' || !this.masterGain) return null
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.82
    this.masterGain.connect(analyser)
    _gcAnchor.add(analyser)
    return {
      analyser,
      disconnect: () => {
        try { analyser.disconnect() } catch { /* already detached */ }
        _gcAnchor.delete(analyser)
      },
    }
  }

  setNormGain(value: number): void {
    this.normGainValue = Math.max(0, value)
    if (this.normGain) {
      this.normGain.gain.value = this.normGainValue
    }
  }

  private ensureGraphSync(): void {
    if (!this.ctx || this.graphBuilt || this.ctx.state === 'closed') return
    _gcAnchor.clear()
    this.buildGraph()
    this.graphBuilt = true
    this.syncAll()
    void this.bitcrusherProc.preloadWorklet()
  }

  private buildGraph(): void {
    const ctx = this.ctx!

    this.graphInput = ctx.createGain()
    this.graphInput.gain.value = 1
    this.attachSource()

    // Build plugin chain via registry (processors register themselves)
    const { output: pluginChainOut, plugins } = buildPluginChain(ctx, this.graphInput)

    // Assign processor refs from built plugins for backward compat
    for (const p of plugins) {
      if (p instanceof BitcrusherProcessor) this.bitcrusherProc = p
      else if (p instanceof DelayProcessor) this.delayProc = p
      else if (p instanceof EqProcessor) this.eqProc = p
      else if (p instanceof DeckProcessor) this.deckProc = p
      else if (p instanceof TapeProcessor) this.tapeProc = p
      else if (p instanceof ReverbProcessor) this.reverbProc = p
    }

    this._killBypass = ctx.createGain()
    this._killBypass.gain.value = 1
    pluginChainOut.connect(this._killBypass)

    this.normGain = ctx.createGain()
    this.normGain.gain.value = 1
    this._killBypass.connect(this.normGain)

    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -1
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001
    this.limiter.release.value = 0.01
    this.normGain.connect(this.limiter)

    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = this.masterGainValue
    this.limiter.connect(this.masterGain)
    this.masterGain.connect(ctx.destination)

    _gcAnchor.add(ctx)
    for (const p of plugins) {
      p.collectNodes(_gcAnchor)
    }

    const extraNodes: (AudioNode | null)[] = [
      this.source, this.graphInput,
      this._killBypass, this.normGain, this.limiter, this.masterGain,
    ]
    for (const n of extraNodes) {
      if (n) _gcAnchor.add(n)
    }
  }

  attachSource(): void {
    if (!this.ctx || !this._audioElement || !this.graphInput) return
    if (!this.source) {
      this.source = this.ctx.createMediaElementSource(this._audioElement)
      _gcAnchor.add(this.source)
    }
    if (!this.sourceConnected) {
      this.source.connect(this.graphInput)
      this.sourceConnected = true
    }
  }

  // ── EQ ──

  setEqGains(gains: number[]): void {
    const raw = this.stateManager.getRawState()
    for (let i = 0; i < 10; i++) {
      raw.eqGains[i] = Math.max(-40, Math.min(40, gains[i] ?? 0))
    }
    raw.eqPreset = 'manual'
    if (this.graphBuilt) this.eqProc.sync(raw)
    this.emit()
  }

  setEqPreset(preset: EqPresetName): void {
    const raw = this.stateManager.getRawState()
    raw.eqPreset = preset
    const presetGains = EQ_PRESETS[preset]
    if (presetGains) {
      for (let i = 0; i < 10; i++) {
        raw.eqGains[i] = presetGains[i] ?? 0
      }
    }
    if (this.graphBuilt) this.eqProc.sync(raw)
    this.emit()
  }

  // ── Tape ──

  setTapeEnabled(enabled: boolean): void { this.setField('setTapeEnabled', enabled) }
  setTapeSaturation(s: number): void { this.setField('setTapeSaturation', s) }
  setCassetteType(type: CassetteType): void { this.setField('setCassetteType', type) }
  setTapeBias(b: number): void { this.setField('setTapeBias', b) }
  setTapeNoise(n: number): void { this.setField('setTapeNoise', n) }
  setTapeWow(w: number): void { this.setField('setTapeWow', w) }
  setTapeFlutter(f: number): void { this.setField('setTapeFlutter', f) }
  setDeckMechanism(deck: DeckType): void { this.setField('setDeckMechanism', deck) }

  setTanashinWear(w: number): void {
    const raw = this.stateManager.getRawState()
    raw.tanashinWear = Math.max(0, Math.min(1, w))
    if (this.graphBuilt) {
      this.deckProc.setTanashinWear(raw.tanashinWear, raw.deckMechanism)
    }
    this.emit()
  }

  setDolbyC(enabled: boolean): void { this.setField('setDolbyC', enabled) }

  // ── Reverb ──

  setReverbEnabled(enabled: boolean): void { this.setField('setReverbEnabled', enabled) }
  setReverbMix(mix: number): void { this.setField('setReverbMix', mix) }

  // ── Quality ──

  setQuality(q: Quality): void {
    // Quality selects the actual stream: the player re-requests the track via
    // /api/stream (transcoded) or the HLS playlist for the "medium" preset.
    // It does not fake quality with the bitcrusher effect.
    const raw = this.stateManager.getRawState()
    raw.quality = q
    this.emit()
  }

  // ── Bitcrusher ──

  setBitcrusherEnabled(enabled: boolean): void { this.setField('setBitcrusherEnabled', enabled) }
  setBitDepth(bits: number): void { this.setField('setBitDepth', bits) }
  setReduction(r: number): void { this.setField('setReduction', r) }

  // ── Comb ──

  setCombEnabled(enabled: boolean): void { this.setField('setCombEnabled', enabled) }
  setCombDelayMs(ms: number): void { this.setField('setCombDelayMs', ms) }
  setCombResonance(r: number): void { this.setField('setCombResonance', r) }

  // ── Chorus ──

  setChorusEnabled(enabled: boolean): void { this.setField('setChorusEnabled', enabled) }
  setChorusRate(rate: number): void { this.setField('setChorusRate', rate) }
  setChorusDepth(depth: number): void { this.setField('setChorusDepth', depth) }
  setChorusMix(mix: number): void { this.setField('setChorusMix', mix) }

  // ── Delay ──

  setDelayEnabled(enabled: boolean): void { this.setField('setDelayEnabled', enabled) }
  setDelayTime(t: number): void { this.setField('setDelayTime', t) }
  setDelayFeedback(f: number): void { this.setField('setDelayFeedback', f) }
  setDelayMix(mix: number): void { this.setField('setDelayMix', mix) }

  setNormalizationMode(mode: 'standard' | 'loud' | 'off'): void {
    const raw = this.stateManager.getRawState()
    raw.normalizationMode = mode
    this.emit()
  }

  setLimiterBypass(_useLimiter: boolean): void {
    // Limiter is always in the chain now (-1 dBTP ceiling).
    // This method is kept for API compat but is a no-op.
  }

  // ── Kill / Panic ──

  toggleKillSwitch(): void {
    this._killSwitch = !this._killSwitch
    if (this._killBypass) {
      this._killBypass.gain.value = this._killSwitch ? 0 : 1
    }
  }

  get killSwitch(): boolean {
    return this._killSwitch
  }

  panic(): void {
    this.deckProc?.stopChewTimer()
    this.deckProc?.setChewActive(false)
    this.deckProc?.clearChewLowpass()
    if (this._killBypass) {
      this._killBypass.gain.value = 1
    }
    this._killSwitch = false
  }

  // ── AutoEQ ──

  applyAutoEqProfile(filters: ProfileFilter[], preamp: number = 0): void {
    const raw = this.stateManager.getRawState()
    raw.autoEqFilters = filters
    raw.eqPreset = 'manual'
    for (let i = 0; i < 10; i++) {
      raw.eqGains[i] = 0
    }
    for (const f of filters) {
      const idx = EQ_FREQUENCIES.indexOf(f.frequency)
      if (idx >= 0) {
        raw.eqGains[idx] = f.gain + preamp
      }
    }
    if (this.graphBuilt) {
      this.eqProc.applyProfileDirect(filters, preamp)
    }
    this.emit()
  }

  setAutoEqModel(model: string): void {
    const raw = this.stateManager.getRawState()
    raw.autoEqModel = model
    this.emit()
  }

  clearAutoEqFilters(): void {
    const raw = this.stateManager.getRawState()
    raw.autoEqFilters = []
    raw.autoEqModel = null
    for (let i = 0; i < 10; i++) {
      raw.eqGains[i] = 0
    }
    if (this.graphBuilt) this.eqProc.sync(raw)
    this.emit()
  }

  // ── Tape Chew ──

  triggerTapeChew(): void {
    if (this.graphBuilt) {
      this.deckProc.triggerTapeChew()
    }
  }

  // ── Persistence ──

  loadPersistedSettings(): void {
    try {
      const raw = localStorage.getItem('audio-engine-state')
      if (!raw) return
      const saved = JSON.parse(raw)
      const state = this.stateManager.getRawState()

      if (Array.isArray(saved.autoEqFilters) && saved.autoEqFilters.length > 0) {
        state.autoEqFilters = saved.autoEqFilters as ProfileFilter[]
        if (typeof saved.autoEqModel === 'string') {
          state.autoEqModel = saved.autoEqModel
        }
        if (saved.eqGains) {
          for (let i = 0; i < 10; i++) {
            state.eqGains[i] = Math.max(-40, Math.min(40, (saved.eqGains as number[])[i] ?? 0))
          }
        }
      } else if (saved.eqPreset && saved.eqPreset !== 'manual') {
        const presetGains = EQ_PRESETS[saved.eqPreset as EqPresetName]
        if (presetGains) {
          for (let i = 0; i < 10; i++) {
            state.eqGains[i] = presetGains[i] ?? 0
          }
        }
        state.eqPreset = saved.eqPreset as EqPresetName
      } else if (saved.eqGains) {
        for (let i = 0; i < 10; i++) {
          state.eqGains[i] = Math.max(-40, Math.min(40, (saved.eqGains as number[])[i] ?? 0))
        }
      }
      if (typeof saved.tapeEnabled === 'boolean') state.tapeEnabled = saved.tapeEnabled
      if (typeof saved.tapeSaturation === 'number') state.tapeSaturation = Math.max(0, Math.min(1, saved.tapeSaturation))
      if (saved.cassetteType) state.cassetteType = saved.cassetteType as CassetteType
      if (typeof saved.tapeBias === 'number') state.tapeBias = Math.max(0, Math.min(1, saved.tapeBias))
      if (typeof saved.tapeNoise === 'number') state.tapeNoise = Math.max(0, Math.min(1, saved.tapeNoise))
      if (typeof saved.tapeWow === 'number') state.tapeWow = Math.max(0, Math.min(1, saved.tapeWow))
      if (typeof saved.tapeFlutter === 'number') state.tapeFlutter = Math.max(0, Math.min(1, saved.tapeFlutter))
      if (saved.deckMechanism) state.deckMechanism = saved.deckMechanism as DeckType
      if (typeof saved.tanashinWear === 'number') state.tanashinWear = Math.max(0, Math.min(1, saved.tanashinWear))
      if (typeof saved.dolbyC === 'boolean') state.dolbyC = saved.dolbyC
      if (typeof saved.reverbEnabled === 'boolean') state.reverbEnabled = saved.reverbEnabled
      if (typeof saved.reverbMix === 'number') state.reverbMix = Math.max(0, Math.min(1, saved.reverbMix))
      if (saved.quality) state.quality = saved.quality as Quality
      if (typeof saved.bitcrusherEnabled === 'boolean') state.bitcrusherEnabled = saved.bitcrusherEnabled
      if (typeof saved.bitDepth === 'number') state.bitDepth = Math.max(1, Math.min(24, Math.round(saved.bitDepth)))
      if (typeof saved.reduction === 'number') state.reduction = Math.max(1, Math.min(64, Math.round(saved.reduction)))
      // Migration: older builds faked the "quality" presets with the bitcrusher
      // and persisted that crushed state. If the stored bitcrush params exactly
      // match a legacy quality preset, clear it — real quality now comes from
      // the stream, and the bitcrusher is an explicit Effects-tab effect only.
      const legacyBitcrush: Partial<Record<Quality, [number, number]>> = {
        extreme_lobit: [4, 8],
        low: [8, 4],
        medium: [12, 2],
      }
      if (
        state.bitcrusherEnabled
        && typeof saved.bitDepth === 'number' && typeof saved.reduction === 'number'
        && legacyBitcrush[state.quality]?.[0] === saved.bitDepth
        && legacyBitcrush[state.quality]?.[1] === saved.reduction
      ) {
        state.bitcrusherEnabled = false
        state.bitDepth = 8
        state.reduction = 2
      }
      if (typeof saved.combEnabled === 'boolean') state.combEnabled = saved.combEnabled
      if (typeof saved.combDelayMs === 'number') state.combDelayMs = Math.max(0.1, Math.min(100, saved.combDelayMs))
      if (typeof saved.combResonance === 'number') state.combResonance = Math.max(0, Math.min(1, saved.combResonance))
      if (typeof saved.chorusEnabled === 'boolean') state.chorusEnabled = saved.chorusEnabled
      if (typeof saved.chorusRate === 'number') state.chorusRate = Math.max(0.1, Math.min(20, saved.chorusRate))
      if (typeof saved.chorusDepth === 'number') state.chorusDepth = Math.max(0, Math.min(1, saved.chorusDepth))
      if (typeof saved.chorusMix === 'number') state.chorusMix = Math.max(0, Math.min(1, saved.chorusMix))
      if (typeof saved.delayEnabled === 'boolean') state.delayEnabled = saved.delayEnabled
      if (typeof saved.delayTime === 'number') state.delayTime = Math.max(0, Math.min(1, saved.delayTime))
      if (typeof saved.delayFeedback === 'number') state.delayFeedback = Math.max(0, Math.min(1, saved.delayFeedback))
      if (typeof saved.delayMix === 'number') state.delayMix = Math.max(0, Math.min(1, saved.delayMix))
      if (typeof saved.normalizationMode === 'string' && ['standard', 'loud', 'off'].includes(saved.normalizationMode)) {
        state.normalizationMode = saved.normalizationMode as 'standard' | 'loud' | 'off'
      } else if (typeof saved.normalizationEnabled === 'boolean') {
        // Migrate legacy boolean setting
        state.normalizationMode = saved.normalizationEnabled ? 'standard' : 'off'
      }
    } catch (e) {
      console.warn('Failed to load persisted audio engine settings:', e)
    }
  }

  private setField(name: string, val: boolean | number | string): void {
    const spec = SETTER_SPECS[name]
    const raw = this.stateManager.getRawState()
    if (spec.clamp === 'boolean') {
      (raw as Record<string, unknown>)[spec.key] = Boolean(val)
    } else if (spec.clamp) {
      let v = Math.max(spec.clamp[0], Math.min(spec.clamp[1], val as number));
      if (spec.round) v = Math.round(v);
      (raw as Record<string, unknown>)[spec.key] = v
    } else {
      (raw as Record<string, unknown>)[spec.key] = val
    }
    const procs = Array.isArray(spec.proc) ? spec.proc : [spec.proc]
    if (this.graphBuilt) {
      for (const p of procs) {
        (this as unknown as { [k: string]: { sync(raw: unknown): void } })[p].sync(raw)
      }
    }
    this.emit()
  }

  private syncAll(): void {
    const raw = this.stateManager.getRawState()
    this.eqProc.sync(raw)
    this.deckProc.sync(raw)
    this.tapeProc.sync(raw)
    this.reverbProc.sync(raw)
    this.bitcrusherProc.sync(raw)
    this.delayProc.sync(raw)
  }
}

let _instance: AudioEngine | null = null

export function getAudioEngine(): AudioEngine {
  if (!_instance) _instance = new AudioEngine()
  return _instance
}
