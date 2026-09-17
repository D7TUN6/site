import type { AudioEngineState, DeckType } from './types.js'
import { makeTapeCurve } from './types.js'
import { identityCurve } from './audio-utils.js'
import { createSafeParams } from './param-helpers.js'
import { registerPlugin } from './plugin-registry.js'

export class DeckProcessor {
  private ctx: AudioContext
  private _deckWowBase = 0
  private _deckFlutterBase = 0
  private _tapeChewTimer: ReturnType<typeof setInterval> | null = null
  private _tapeChewActive = false

  deckInputGain!: GainNode
  deckOutputGain!: GainNode
  deckOutGate!: GainNode
  deckBypass!: GainNode
  deckNakamichiShaper!: WaveShaperNode
  deckHeadBump!: BiquadFilterNode
  deckDolbyShelving!: BiquadFilterNode
  deckEqHighpass!: BiquadFilterNode
  deckEqLowpass!: BiquadFilterNode
  deckTapeChewLowpass!: BiquadFilterNode
  deckWowDelay!: DelayNode
  deckAzimuthDelayR!: DelayNode
  deckWowLfo!: OscillatorNode
  deckWowGain!: GainNode
  deckFlutterLfo!: OscillatorNode
  deckFlutterGain!: GainNode
  deckMotorWhine!: OscillatorNode
  deckMotorWhineFilter!: BiquadFilterNode
  deckMotorWhineGain!: GainNode
  deckAzimuthLfo!: OscillatorNode
  deckAzimuthGain!: GainNode
  deckDolbySidechainHpf!: BiquadFilterNode
  deckDolbyRectifier!: WaveShaperNode
  deckDolbyEnvelopeLpf!: BiquadFilterNode
  deckDolbyModGain!: GainNode
  dspOutput!: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.createNodes()
  }

  private createNodes(): void {
    const ctx = this.ctx
    const safe = createSafeParams(ctx.sampleRate)

    this.deckInputGain = ctx.createGain()
    this.deckInputGain.gain.value = 0.7

    this.deckNakamichiShaper = ctx.createWaveShaper()
    this.deckNakamichiShaper.curve = identityCurve()
    this.deckInputGain.connect(this.deckNakamichiShaper)

    this.deckHeadBump = ctx.createBiquadFilter()
    this.deckHeadBump.type = 'peaking'
    this.deckHeadBump.frequency.value = safe.clampFreq(4000)
    this.deckHeadBump.gain.value = 0
    this.deckHeadBump.Q.value = safe.clampQ(1)
    this.deckNakamichiShaper.connect(this.deckHeadBump)

    this.deckDolbyShelving = ctx.createBiquadFilter()
    this.deckDolbyShelving.type = 'highshelf'
    this.deckDolbyShelving.frequency.value = safe.clampFreq(2000)
    this.deckDolbyShelving.gain.value = 0
    this.deckHeadBump.connect(this.deckDolbyShelving)

    this.deckEqHighpass = ctx.createBiquadFilter()
    this.deckEqHighpass.type = 'highpass'
    this.deckEqHighpass.frequency.value = safe.clampFreq(20)
    this.deckDolbyShelving.connect(this.deckEqHighpass)

    this.deckEqLowpass = ctx.createBiquadFilter()
    this.deckEqLowpass.type = 'lowpass'
    this.deckEqLowpass.frequency.value = safe.clampFreq(safe.nyquist - 1)
    this.deckEqHighpass.connect(this.deckEqLowpass)

    this.deckTapeChewLowpass = ctx.createBiquadFilter()
    this.deckTapeChewLowpass.type = 'lowpass'
    this.deckTapeChewLowpass.frequency.value = safe.clampFreq(safe.nyquist - 1)
    this.deckEqLowpass.connect(this.deckTapeChewLowpass)

    this.deckWowDelay = ctx.createDelay(0.1)
    this.deckWowDelay.delayTime.value = 0
    this.deckTapeChewLowpass.connect(this.deckWowDelay)

    this.deckAzimuthDelayR = ctx.createDelay(0.02)
    this.deckAzimuthDelayR.delayTime.value = 0
    this.deckWowDelay.connect(this.deckAzimuthDelayR)

    this.deckOutputGain = ctx.createGain()
    this.deckOutputGain.gain.value = 1.43
    this.deckAzimuthDelayR.connect(this.deckOutputGain)

    this.deckWowLfo = ctx.createOscillator()
    this.deckWowLfo.type = 'sine'
    this.deckWowLfo.frequency.value = 1.5
    this.deckWowGain = ctx.createGain()
    this.deckWowGain.gain.value = 0
    this.deckWowLfo.connect(this.deckWowGain)
    this.deckWowGain.connect(this.deckWowDelay.delayTime)

    this.deckFlutterLfo = ctx.createOscillator()
    this.deckFlutterLfo.type = 'sine'
    this.deckFlutterLfo.frequency.value = 5
    this.deckFlutterGain = ctx.createGain()
    this.deckFlutterGain.gain.value = 0
    this.deckFlutterLfo.connect(this.deckFlutterGain)
    this.deckFlutterGain.connect(this.deckWowDelay.delayTime)

    this.deckMotorWhine = ctx.createOscillator()
    this.deckMotorWhine.type = 'sine'
    this.deckMotorWhine.frequency.value = 100
    this.deckMotorWhineFilter = ctx.createBiquadFilter()
    this.deckMotorWhineFilter.type = 'bandpass'
    this.deckMotorWhineFilter.frequency.value = safe.clampFreq(100)
    this.deckMotorWhineFilter.Q.value = safe.clampQ(10)
    this.deckMotorWhineGain = ctx.createGain()
    this.deckMotorWhineGain.gain.value = 0
    this.deckMotorWhine.connect(this.deckMotorWhineFilter)
    this.deckMotorWhineFilter.connect(this.deckMotorWhineGain)
    this.deckMotorWhineGain.connect(this.deckOutputGain)

    this.deckAzimuthLfo = ctx.createOscillator()
    this.deckAzimuthLfo.type = 'sine'
    this.deckAzimuthLfo.frequency.value = 0.2
    this.deckAzimuthGain = ctx.createGain()
    this.deckAzimuthGain.gain.value = 0
    this.deckAzimuthLfo.connect(this.deckAzimuthGain)
    this.deckAzimuthGain.connect(this.deckAzimuthDelayR.delayTime)

    this.deckDolbySidechainHpf = ctx.createBiquadFilter()
    this.deckDolbySidechainHpf.type = 'highpass'
    this.deckDolbySidechainHpf.frequency.value = safe.clampFreq(2000)
    this.deckDolbyRectifier = ctx.createWaveShaper()
    const rectCurve = new Float32Array(256) as Float32Array<ArrayBuffer>
    for (let i = 0; i < 256; i++) {
      rectCurve[i] = Math.abs((i / 127.5) - 1)
    }
    this.deckDolbyRectifier.curve = rectCurve
    this.deckDolbyEnvelopeLpf = ctx.createBiquadFilter()
    this.deckDolbyEnvelopeLpf.type = 'lowpass'
    this.deckDolbyEnvelopeLpf.frequency.value = safe.clampFreq(50)
    this.deckDolbyModGain = ctx.createGain()
    this.deckDolbyModGain.gain.value = 0

    this.deckInputGain.connect(this.deckDolbySidechainHpf)
    this.deckDolbySidechainHpf.connect(this.deckDolbyRectifier)
    this.deckDolbyRectifier.connect(this.deckDolbyEnvelopeLpf)
    this.deckDolbyEnvelopeLpf.connect(this.deckDolbyModGain)

    this.deckOutGate = ctx.createGain()
    this.deckOutGate.gain.value = 0
    this.deckOutputGain.connect(this.deckOutGate)

    this.deckBypass = ctx.createGain()
    this.deckBypass.gain.value = 1

    this.dspOutput = ctx.createGain()
    this.dspOutput.gain.value = 1
    this.deckOutGate.connect(this.dspOutput)
    // deckBypass is connected via connect()

    const now = ctx.currentTime
    this.deckWowLfo.start(now)
    this.deckFlutterLfo.start(now)
    this.deckMotorWhine.start(now)
    this.deckAzimuthLfo.start(now)

    this.startChewTimer()
  }

  connect(prev: AudioNode): AudioNode {
    prev.connect(this.deckInputGain)
    prev.connect(this.deckBypass)
    this.deckBypass.connect(this.dspOutput)
    return this.dspOutput
  }

  sync(state: AudioEngineState): void {
    this.configureDeck(state.deckMechanism)
    this.applyWowFlutter(state)
    this.syncDolby(state)
    this.syncTapeRouting(state)
  }

  private syncTapeRouting(state: AudioEngineState): void {
    if (state.tapeEnabled) {
      this.deckBypass.gain.value = 0
      this.deckOutGate.gain.value = 1
    } else {
      this.deckBypass.gain.value = 1
      this.deckOutGate.gain.value = 0
    }
  }

  private configureDeck(deck: DeckType): void {
    switch (deck) {
      case 'nakamichi':
        this.deckNakamichiShaper.curve = makeTapeCurve(0.5)
        this.deckHeadBump.gain.value = 2
        this._deckWowBase = 0.1
        this._deckFlutterBase = 0.05
        this.deckMotorWhineGain.gain.value = 0
        break
      case 'technics':
        this.deckNakamichiShaper.curve = identityCurve()
        this.deckHeadBump.gain.value = 0
        this._deckWowBase = 0.3
        this._deckFlutterBase = 0.2
        this.deckMotorWhineGain.gain.value = 0
        break
      case 'tanashin':
        this.deckNakamichiShaper.curve = makeTapeCurve(1)
        this.deckHeadBump.gain.value = 1
        this._deckWowBase = 0.6
        this._deckFlutterBase = 0.5
        this.deckMotorWhineGain.gain.value = 0.02
        break
      case 'chinese_walkman':
        this.deckNakamichiShaper.curve = makeTapeCurve(2)
        this.deckHeadBump.gain.value = 0
        this._deckWowBase = 1.0
        this._deckFlutterBase = 1.0
        this.deckMotorWhineGain.gain.value = 0.05
        break
    }
  }

  private applyWowFlutter(state: AudioEngineState): void {
    const wow = state.tapeWow * this._deckWowBase
    const flutter = state.tapeFlutter * this._deckFlutterBase
    this.deckWowGain.gain.value = wow * 0.002
    this.deckFlutterGain.gain.value = flutter * 0.001
    this.deckWowLfo.frequency.value = 1.5 + state.tapeWow * 2
    this.deckFlutterLfo.frequency.value = 5 + state.tapeFlutter * 10
  }

  private syncDolby(state: AudioEngineState): void {
    if (state.dolbyC) {
      this.deckDolbyModGain.gain.value = 16
    } else {
      this.deckDolbyModGain.gain.value = 0
    }
  }

  setTanashinWear(wear: number, deck: DeckType): void {
    if (deck === 'tanashin') {
      this.deckHeadBump.gain.value = 1 + wear * 4
      this.deckNakamichiShaper.curve = makeTapeCurve(1 + wear * 2)
    }
  }

  private startChewTimer(): void {
    const clampFreq = (f: number) => Math.max(20, Math.min(f, this.ctx.sampleRate / 2 - 100))
    this._tapeChewTimer = setInterval(() => {
      if (!this._tapeChewActive) {
        this.deckTapeChewLowpass.frequency.value = this.ctx.sampleRate / 2 - 1
        return
      }
      if (Math.random() < 0.1 && !this._tapeChewActive) {
        this._tapeChewActive = true
        const chewFreq = 2000 + Math.random() * 6000
        this.deckTapeChewLowpass.frequency.value = clampFreq(chewFreq)
        setTimeout(() => {
          this.deckTapeChewLowpass.frequency.value = this.ctx.sampleRate / 2 - 1
          this._tapeChewActive = false
        }, 100 + Math.random() * 200)
      }
    }, 3000)
  }

  stopChewTimer(): void {
    if (this._tapeChewTimer) {
      clearInterval(this._tapeChewTimer)
      this._tapeChewTimer = null
    }
    this._tapeChewActive = false
  }

  triggerTapeChew(): void {
    if (!this.deckTapeChewLowpass) return
    this.deckTapeChewLowpass.frequency.value = 1500 + Math.random() * 3000
    setTimeout(() => {
      if (this.deckTapeChewLowpass) {
        this.deckTapeChewLowpass.frequency.value = this.ctx.sampleRate / 2 - 1
      }
    }, 300)
  }

  clearChewLowpass(): void {
    if (this.deckTapeChewLowpass) {
      this.deckTapeChewLowpass.frequency.value = this.ctx.sampleRate / 2 - 1
    }
  }

  isChewActive(): boolean {
    return this._tapeChewActive
  }

  setChewActive(v: boolean): void {
    this._tapeChewActive = v
  }

  stopNodes(): void {
    this.deckWowLfo?.stop()
    this.deckFlutterLfo?.stop()
    this.deckMotorWhine?.stop()
    this.deckAzimuthLfo?.stop()
  }

  resetRefs(): void {
    this.stopNodes()
    this.stopChewTimer()
    this.deckInputGain = null!
    this.deckOutputGain = null!
    this.deckOutGate = null!
    this.deckBypass = null!
    this.deckNakamichiShaper = null!
    this.deckHeadBump = null!
    this.deckDolbyShelving = null!
    this.deckEqHighpass = null!
    this.deckEqLowpass = null!
    this.deckTapeChewLowpass = null!
    this.deckWowDelay = null!
    this.deckAzimuthDelayR = null!
    this.deckWowLfo = null!
    this.deckWowGain = null!
    this.deckFlutterLfo = null!
    this.deckFlutterGain = null!
    this.deckMotorWhine = null!
    this.deckMotorWhineFilter = null!
    this.deckMotorWhineGain = null!
    this.deckAzimuthLfo = null!
    this.deckAzimuthGain = null!
    this.deckDolbySidechainHpf = null!
    this.deckDolbyRectifier = null!
    this.deckDolbyEnvelopeLpf = null!
    this.deckDolbyModGain = null!
    this.dspOutput = null!
  }

  collectNodes(target: Set<object>): void {
    const nodes: (AudioNode | null)[] = [
      this.deckInputGain, this.deckOutputGain, this.deckOutGate, this.deckBypass,
      this.deckNakamichiShaper, this.deckHeadBump,
      this.deckDolbyShelving, this.deckEqHighpass, this.deckEqLowpass,
      this.deckTapeChewLowpass, this.deckWowDelay, this.deckAzimuthDelayR,
      this.deckWowLfo, this.deckWowGain,
      this.deckFlutterLfo, this.deckFlutterGain,
      this.deckMotorWhine, this.deckMotorWhineFilter, this.deckMotorWhineGain,
      this.deckAzimuthLfo, this.deckAzimuthGain,
      this.deckDolbySidechainHpf, this.deckDolbyRectifier,
      this.deckDolbyEnvelopeLpf, this.deckDolbyModGain,
      this.dspOutput,
    ]
    for (const n of nodes) {
      if (n) target.add(n)
    }
  }
}

registerPlugin('deck', DeckProcessor as unknown as new (ctx: AudioContext) => import('./plugin-registry.js').AudioPlugin)
