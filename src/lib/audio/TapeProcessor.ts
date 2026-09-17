import type { AudioEngineState } from './types.js'
import { CASSETTE_PRESETS, makeTapeCurve, generatePinkNoise } from './types.js'
import { createSafeParams } from './param-helpers.js'
import { registerPlugin } from './plugin-registry.js'

let pinkNoiseCache: { ctx: AudioContext; buffer: AudioBuffer } | null = null

export class TapeProcessor {
  private ctx: AudioContext

  cassetteHighpass!: BiquadFilterNode
  cassetteLowshelf!: BiquadFilterNode
  cassettePeaking!: BiquadFilterNode
  cassetteLowpass!: BiquadFilterNode
  tapeInputGain!: GainNode
  tapeShaper!: WaveShaperNode
  tapeBiasHighpass!: BiquadFilterNode
  tapeBiasLowshelf!: BiquadFilterNode
  tapeBiasShelving!: BiquadFilterNode
  tapeFilter!: BiquadFilterNode
  tapeRumble!: BiquadFilterNode
  tapeWetSum!: GainNode
  tapeWet!: GainNode
  tapeDry!: GainNode
  tapeNoiseSource!: AudioBufferSourceNode
  tapeNoiseGain!: GainNode
  outputSum!: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.createNodes()
  }

  private createNodes(): void {
    const ctx = this.ctx
    const safe = createSafeParams(ctx.sampleRate)

    this.outputSum = ctx.createGain()
    this.outputSum.gain.value = 1

    this.tapeDry = ctx.createGain()
    this.tapeDry.gain.value = 1
    this.tapeDry.connect(this.outputSum)

    this.cassetteHighpass = ctx.createBiquadFilter()
    this.cassetteHighpass.type = 'highpass'
    this.cassetteHighpass.frequency.value = safe.clampFreq(30)

    this.cassetteLowshelf = ctx.createBiquadFilter()
    this.cassetteLowshelf.type = 'lowshelf'
    this.cassetteLowshelf.frequency.value = safe.clampFreq(80)
    this.cassetteLowshelf.gain.value = 0
    this.cassetteHighpass.connect(this.cassetteLowshelf)

    this.cassettePeaking = ctx.createBiquadFilter()
    this.cassettePeaking.type = 'peaking'
    this.cassettePeaking.frequency.value = safe.clampFreq(3000)
    this.cassettePeaking.gain.value = 0
    this.cassettePeaking.Q.value = safe.clampQ(0.8)
    this.cassetteLowshelf.connect(this.cassettePeaking)

    this.cassetteLowpass = ctx.createBiquadFilter()
    this.cassetteLowpass.type = 'lowpass'
    this.cassetteLowpass.frequency.value = safe.clampFreq(16000)
    this.cassettePeaking.connect(this.cassetteLowpass)

    this.tapeInputGain = ctx.createGain()
    this.tapeInputGain.gain.value = 1
    this.cassetteLowpass.connect(this.tapeInputGain)

    this.tapeShaper = ctx.createWaveShaper()
    this.tapeShaper.curve = makeTapeCurve(2)
    this.tapeInputGain.connect(this.tapeShaper)

    this.tapeBiasHighpass = ctx.createBiquadFilter()
    this.tapeBiasHighpass.type = 'highpass'
    this.tapeBiasHighpass.frequency.value = safe.clampFreq(20)
    this.tapeShaper.connect(this.tapeBiasHighpass)

    this.tapeBiasLowshelf = ctx.createBiquadFilter()
    this.tapeBiasLowshelf.type = 'lowshelf'
    this.tapeBiasLowshelf.frequency.value = safe.clampFreq(150)
    this.tapeBiasLowshelf.gain.value = 0
    this.tapeBiasHighpass.connect(this.tapeBiasLowshelf)

    this.tapeBiasShelving = ctx.createBiquadFilter()
    this.tapeBiasShelving.type = 'highshelf'
    this.tapeBiasShelving.frequency.value = safe.clampFreq(5000)
    this.tapeBiasShelving.gain.value = 0
    this.tapeBiasLowshelf.connect(this.tapeBiasShelving)

    this.tapeFilter = ctx.createBiquadFilter()
    this.tapeFilter.type = 'lowpass'
    this.tapeFilter.frequency.value = safe.clampFreq(14000)
    this.tapeBiasShelving.connect(this.tapeFilter)

    this.tapeRumble = ctx.createBiquadFilter()
    this.tapeRumble.type = 'highpass'
    this.tapeRumble.frequency.value = safe.clampFreq(20)
    this.tapeFilter.connect(this.tapeRumble)

    this.tapeWetSum = ctx.createGain()
    this.tapeWetSum.gain.value = 1
    this.tapeRumble.connect(this.tapeWetSum)

    this.tapeWet = ctx.createGain()
    this.tapeWet.gain.value = 0
    this.tapeWetSum.connect(this.tapeWet)
    this.tapeWet.connect(this.outputSum)

    this.tapeNoiseSource = ctx.createBufferSource()
    if (!pinkNoiseCache || pinkNoiseCache.ctx !== ctx) {
      pinkNoiseCache = { ctx, buffer: generatePinkNoise(ctx, 4) }
    }
    this.tapeNoiseSource.buffer = pinkNoiseCache.buffer
    this.tapeNoiseSource.loop = true
    this.tapeNoiseGain = ctx.createGain()
    this.tapeNoiseGain.gain.value = 0
    this.tapeNoiseSource.connect(this.tapeNoiseGain)
    this.tapeNoiseGain.connect(this.tapeWetSum)

    this.tapeNoiseSource.start(ctx.currentTime)
  }

  connect(prev: AudioNode): AudioNode {
    prev.connect(this.tapeDry)
    prev.connect(this.cassetteHighpass)
    return this.outputSum
  }

  sync(state: AudioEngineState): void {
    const spec = CASSETTE_PRESETS[state.cassetteType]

    this.cassetteHighpass.frequency.value = spec.highpass
    this.cassetteLowshelf.frequency.value = spec.lowshelfFreq
    this.cassetteLowshelf.gain.value = spec.lowshelfGain
    this.cassettePeaking.frequency.value = spec.peakFreq
    this.cassettePeaking.gain.value = spec.peakGain
    this.cassettePeaking.Q.value = spec.peakQ
    this.cassetteLowpass.frequency.value = spec.lowpassFreq

    const sat = state.tapeSaturation
    const k = sat * 2
    this.tapeShaper.curve = makeTapeCurve(k)
    this.tapeInputGain.gain.value = 1 + sat * 1.5

    const b = state.tapeBias
    this.tapeBiasHighpass.frequency.value = 20 + b * 20 + Math.max(0, b - 0.5) * 360
    this.tapeBiasLowshelf.frequency.value = 150
    this.tapeBiasLowshelf.gain.value = (0.5 - b) * 16
    this.tapeBiasShelving.frequency.value = 2000 + b * 3000
    this.tapeBiasShelving.gain.value = (b - 0.5) * 22
    this.tapeFilter.frequency.value =
      b <= 0.5 ? 5000 + (b / 0.5) * 13000 : 18000 - ((b - 0.5) / 0.5) * 8000

    this.tapeNoiseGain.gain.value = state.tapeNoise * 0.03

    if (state.tapeEnabled) {
      this.tapeDry.gain.value = 0
      this.tapeWet.gain.value = 1
    } else {
      this.tapeDry.gain.value = 1
      this.tapeWet.gain.value = 0
    }
  }

  stopNodes(): void {
    this.tapeNoiseSource?.stop()
  }

  resetRefs(): void {
    this.stopNodes()
    this.cassetteHighpass = null!
    this.cassetteLowshelf = null!
    this.cassettePeaking = null!
    this.cassetteLowpass = null!
    this.tapeInputGain = null!
    this.tapeShaper = null!
    this.tapeBiasHighpass = null!
    this.tapeBiasLowshelf = null!
    this.tapeBiasShelving = null!
    this.tapeFilter = null!
    this.tapeRumble = null!
    this.tapeWetSum = null!
    this.tapeWet = null!
    this.tapeDry = null!
    this.tapeNoiseSource = null!
    this.tapeNoiseGain = null!
    this.outputSum = null!
  }

  collectNodes(target: Set<object>): void {
    const nodes: (AudioNode | null)[] = [
      this.cassetteHighpass, this.cassetteLowshelf,
      this.cassettePeaking, this.cassetteLowpass,
      this.tapeInputGain, this.tapeShaper,
      this.tapeBiasHighpass, this.tapeBiasLowshelf, this.tapeBiasShelving,
      this.tapeFilter, this.tapeRumble,
      this.tapeWetSum, this.tapeWet, this.tapeDry,
      this.outputSum,
      this.tapeNoiseSource, this.tapeNoiseGain,
    ]
    for (const n of nodes) {
      if (n) target.add(n)
    }
  }
}

registerPlugin('tape', TapeProcessor as unknown as new (ctx: AudioContext) => import('./plugin-registry.js').AudioPlugin)
