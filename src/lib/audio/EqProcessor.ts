import type { AudioEngineState, ProfileFilter } from './types.js'
import { EQ_FREQUENCIES, EQ_TYPES } from './types.js'
import { createSafeParams } from './param-helpers.js'
import { registerPlugin } from './plugin-registry.js'

export class EqProcessor {
  private ctx: AudioContext
  preAmp!: GainNode
  eqBands: BiquadFilterNode[] = []

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.createNodes()
  }

  private createNodes(): void {
    const ctx = this.ctx
    const safe = createSafeParams(ctx.sampleRate)

    this.preAmp = ctx.createGain()
    this.preAmp.gain.value = 1

    const eqBands: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq, i) => {
      const f = ctx.createBiquadFilter()
      f.type = EQ_TYPES[i]
      f.frequency.value = safe.clampFreq(freq)
      f.gain.value = 0
      f.Q.value = safe.clampQ(0.707)
      return f
    })
    EQ_FREQUENCIES.forEach((_freq, i) => {
      if (i === 0) {
        this.preAmp.connect(eqBands[0])
      } else {
        eqBands[i - 1].connect(eqBands[i])
      }
    })
    this.eqBands = eqBands
  }

  connect(prev: AudioNode): AudioNode {
    prev.connect(this.preAmp)
    return this.eqBands[9]
  }

  sync(state: AudioEngineState): void {
    const safe = createSafeParams(this.ctx.sampleRate)
    const gains = state.eqGains
    for (let i = 0; i < this.eqBands.length; i++) {
      if (this.eqBands[i]) {
        this.eqBands[i].gain.value = safe.clampGain(gains[i] ?? 0)
      }
    }
    this.syncAutoEq(state)
  }

  syncAutoEq(state: AudioEngineState): void {
    const filters = state.autoEqFilters
    if (filters.length === 0) return
    for (const f of filters) {
      const idx = EQ_FREQUENCIES.indexOf(f.frequency)
      if (idx >= 0 && this.eqBands[idx]) {
        this.eqBands[idx].type = f.type
        this.eqBands[idx].frequency.value = f.frequency
        this.eqBands[idx].Q.value = f.q
      }
    }
  }

  applyProfileDirect(filters: ProfileFilter[], preamp: number): void {
    for (const f of filters) {
      const idx = EQ_FREQUENCIES.indexOf(f.frequency)
      if (idx >= 0 && this.eqBands[idx]) {
        this.eqBands[idx].type = f.type
        this.eqBands[idx].frequency.value = f.frequency
        this.eqBands[idx].gain.value = f.gain + preamp
        this.eqBands[idx].Q.value = f.q
      }
    }
  }

  resetRefs(): void {
    this.preAmp = null!
    this.eqBands = []
  }

  collectNodes(target: Set<object>): void {
    if (this.preAmp) target.add(this.preAmp)
    for (const b of this.eqBands) {
      if (b) target.add(b)
    }
  }
}

registerPlugin('eq', EqProcessor as unknown as new (ctx: AudioContext) => import('./plugin-registry.js').AudioPlugin)
