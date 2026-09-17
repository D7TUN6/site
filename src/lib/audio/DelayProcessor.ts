import type { AudioEngineState } from './types.js'
import { clamp01 } from './audio-utils.js'
import { createSafeParams } from './param-helpers.js'
import { registerPlugin } from './plugin-registry.js'

export class DelayProcessor {
  private ctx: AudioContext

  combInput!: GainNode
  combBypass!: GainNode
  combDelay!: DelayNode
  combFeedback!: GainNode
  combGate!: GainNode
  combOutput!: GainNode

  chorusInput!: GainNode
  chorusBypass!: GainNode
  chorusDelayL!: DelayNode
  chorusDelayR!: DelayNode
  chorusDelayC!: DelayNode
  chorusLfoL!: OscillatorNode
  chorusLfoR!: OscillatorNode
  chorusLfoC!: OscillatorNode
  chorusLfoGainL!: GainNode
  chorusLfoGainR!: GainNode
  chorusLfoGainC!: GainNode
  chorusMixDry!: GainNode
  chorusMixWet!: GainNode
  chorusOutput!: GainNode

  delayInput!: GainNode
  delayBypass!: GainNode
  delayNode!: DelayNode
  delayFeedbackGain!: GainNode
  delayLowpass!: BiquadFilterNode
  delayHighpass!: BiquadFilterNode
  delayMixDry!: GainNode
  delayMixWet!: GainNode
  delayOutput!: GainNode
  delayLfo!: OscillatorNode
  delayLfoGain!: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.createNodes()
  }

  private createNodes(): void {
    const ctx = this.ctx
    const safe = createSafeParams(ctx.sampleRate)

    this.combInput = ctx.createGain()
    this.combInput.gain.value = 1

    this.combBypass = ctx.createGain()
    this.combBypass.gain.value = 1
    this.combInput.connect(this.combBypass)

    this.combDelay = ctx.createDelay(1)
    this.combDelay.delayTime.value = 0.003
    this.combInput.connect(this.combDelay)

    this.combFeedback = ctx.createGain()
    this.combFeedback.gain.value = 0
    this.combDelay.connect(this.combFeedback)
    this.combFeedback.connect(this.combInput)

    this.combGate = ctx.createGain()
    this.combGate.gain.value = 0
    this.combDelay.connect(this.combGate)

    this.combOutput = ctx.createGain()
    this.combOutput.gain.value = 1
    this.combBypass.connect(this.combOutput)
    this.combGate.connect(this.combOutput)

    this.chorusInput = ctx.createGain()
    this.chorusInput.gain.value = 1
    this.combOutput.connect(this.chorusInput)

    this.chorusBypass = ctx.createGain()
    this.chorusBypass.gain.value = 1
    this.chorusInput.connect(this.chorusBypass)

    this.chorusDelayL = ctx.createDelay(0.1)
    this.chorusDelayR = ctx.createDelay(0.1)
    this.chorusDelayC = ctx.createDelay(0.1)
    this.chorusDelayL.delayTime.value = 0.015
    this.chorusDelayR.delayTime.value = 0.020
    this.chorusDelayC.delayTime.value = 0.025
    this.chorusInput.connect(this.chorusDelayL)
    this.chorusInput.connect(this.chorusDelayR)
    this.chorusInput.connect(this.chorusDelayC)

    this.chorusLfoL = ctx.createOscillator()
    this.chorusLfoR = ctx.createOscillator()
    this.chorusLfoC = ctx.createOscillator()
    this.chorusLfoL.type = 'sine'
    this.chorusLfoR.type = 'sine'
    this.chorusLfoC.type = 'sine'
    this.chorusLfoL.frequency.value = 1
    this.chorusLfoR.frequency.value = 0.8
    this.chorusLfoC.frequency.value = 1.2

    this.chorusLfoGainL = ctx.createGain()
    this.chorusLfoGainR = ctx.createGain()
    this.chorusLfoGainC = ctx.createGain()
    this.chorusLfoGainL.gain.value = 0
    this.chorusLfoGainR.gain.value = 0
    this.chorusLfoGainC.gain.value = 0
    this.chorusLfoL.connect(this.chorusLfoGainL)
    this.chorusLfoR.connect(this.chorusLfoGainR)
    this.chorusLfoC.connect(this.chorusLfoGainC)
    this.chorusLfoGainL.connect(this.chorusDelayL.delayTime)
    this.chorusLfoGainR.connect(this.chorusDelayR.delayTime)
    this.chorusLfoGainC.connect(this.chorusDelayC.delayTime)

    this.chorusMixDry = ctx.createGain()
    this.chorusMixDry.gain.value = 1
    this.chorusInput.connect(this.chorusMixDry)

    this.chorusMixWet = ctx.createGain()
    this.chorusMixWet.gain.value = 0
    this.chorusDelayL.connect(this.chorusMixWet)
    this.chorusDelayR.connect(this.chorusMixWet)
    this.chorusDelayC.connect(this.chorusMixWet)

    this.chorusOutput = ctx.createGain()
    this.chorusOutput.gain.value = 1
    this.chorusBypass.connect(this.chorusOutput)
    this.chorusMixDry.connect(this.chorusOutput)
    this.chorusMixWet.connect(this.chorusOutput)

    this.delayInput = ctx.createGain()
    this.delayInput.gain.value = 1
    this.chorusOutput.connect(this.delayInput)

    this.delayBypass = ctx.createGain()
    this.delayBypass.gain.value = 1
    this.delayInput.connect(this.delayBypass)

    this.delayNode = ctx.createDelay(10)
    this.delayNode.delayTime.value = 0.3
    this.delayInput.connect(this.delayNode)

    this.delayLowpass = ctx.createBiquadFilter()
    this.delayLowpass.type = 'lowpass'
    this.delayLowpass.frequency.value = safe.clampFreq(8000)
    this.delayNode.connect(this.delayLowpass)

    this.delayHighpass = ctx.createBiquadFilter()
    this.delayHighpass.type = 'highpass'
    this.delayHighpass.frequency.value = safe.clampFreq(40)
    this.delayLowpass.connect(this.delayHighpass)

    this.delayFeedbackGain = ctx.createGain()
    this.delayFeedbackGain.gain.value = 0
    this.delayHighpass.connect(this.delayFeedbackGain)
    this.delayFeedbackGain.connect(this.delayInput)

    this.delayMixDry = ctx.createGain()
    this.delayMixDry.gain.value = 1
    this.delayInput.connect(this.delayMixDry)

    this.delayMixWet = ctx.createGain()
    this.delayMixWet.gain.value = 0
    this.delayNode.connect(this.delayMixWet)

    this.delayOutput = ctx.createGain()
    this.delayOutput.gain.value = 1
    this.delayBypass.connect(this.delayOutput)
    this.delayMixDry.connect(this.delayOutput)
    this.delayMixWet.connect(this.delayOutput)

    this.delayLfo = ctx.createOscillator()
    this.delayLfo.type = 'sine'
    this.delayLfo.frequency.value = 0.4
    this.delayLfoGain = ctx.createGain()
    this.delayLfoGain.gain.value = 0
    this.delayLfo.connect(this.delayLfoGain)
    this.delayLfoGain.connect(this.delayNode.delayTime)

    const now = ctx.currentTime
    this.chorusLfoL.start(now)
    this.chorusLfoR.start(now)
    this.chorusLfoC.start(now)
    this.delayLfo.start(now)
  }

  connect(prev: AudioNode): AudioNode {
    prev.connect(this.combInput)
    return this.delayOutput
  }

  sync(state: AudioEngineState): void {
    this.syncComb(state)
    this.syncChorus(state)
    this.syncDelay(state)
  }

  private syncComb(state: AudioEngineState): void {
    const enabled = state.combEnabled
    if (enabled) {
      this.combBypass.gain.value = 0
      this.combGate.gain.value = 1
      this.combDelay.delayTime.value = state.combDelayMs / 1000
      this.combFeedback.gain.value = state.combResonance * 0.9
    } else {
      this.combBypass.gain.value = 1
      this.combGate.gain.value = 0
      this.combFeedback.gain.value = 0
    }
  }

  private syncChorus(state: AudioEngineState): void {
    const enabled = state.chorusEnabled
    if (enabled) {
      this.chorusBypass.gain.value = 0
      const depth = state.chorusDepth * 0.005
      this.chorusLfoGainL.gain.value = depth
      this.chorusLfoGainR.gain.value = depth * 0.8
      this.chorusLfoGainC.gain.value = depth * 0.6
      this.chorusLfoL.frequency.value = state.chorusRate
      this.chorusLfoR.frequency.value = state.chorusRate * 0.8
      this.chorusLfoC.frequency.value = state.chorusRate * 1.2
      const mix = clamp01(state.chorusMix)
      this.chorusMixDry.gain.value = 1 - mix
      this.chorusMixWet.gain.value = mix
    } else {
      this.chorusBypass.gain.value = 1
      this.chorusMixWet.gain.value = 0
      this.chorusMixDry.gain.value = 0
    }
  }

  private syncDelay(state: AudioEngineState): void {
    const enabled = state.delayEnabled
    if (enabled) {
      this.delayBypass.gain.value = 0
      this.delayNode.delayTime.value = clamp01(state.delayTime) * 7.95 + 0.05
      this.delayFeedbackGain.gain.value = clamp01(state.delayFeedback) * 0.9
      this.delayLowpass.frequency.value = 1200
      this.delayHighpass.frequency.value = 40
      this.delayLfoGain.gain.value = 0.002
      this.delayLfo.frequency.value = 0.4
      const mix = clamp01(state.delayMix)
      this.delayMixDry.gain.value = 1 - mix
      this.delayMixWet.gain.value = mix
    } else {
      this.delayBypass.gain.value = 1
      this.delayFeedbackGain.gain.value = 0
      this.delayMixWet.gain.value = 0
      this.delayMixDry.gain.value = 0
      this.delayLfoGain.gain.value = 0
    }
  }

  stopNodes(): void {
    this.chorusLfoL?.stop()
    this.chorusLfoR?.stop()
    this.chorusLfoC?.stop()
    this.delayLfo?.stop()
  }

  resetRefs(): void {
    this.stopNodes()
    this.combInput = null!
    this.combBypass = null!
    this.combDelay = null!
    this.combFeedback = null!
    this.combGate = null!
    this.combOutput = null!
    this.chorusInput = null!
    this.chorusBypass = null!
    this.chorusOutput = null!
    this.chorusDelayL = null!
    this.chorusDelayR = null!
    this.chorusDelayC = null!
    this.chorusLfoL = null!
    this.chorusLfoR = null!
    this.chorusLfoC = null!
    this.chorusLfoGainL = null!
    this.chorusLfoGainR = null!
    this.chorusLfoGainC = null!
    this.chorusMixDry = null!
    this.chorusMixWet = null!
    this.delayInput = null!
    this.delayBypass = null!
    this.delayOutput = null!
    this.delayNode = null!
    this.delayFeedbackGain = null!
    this.delayLowpass = null!
    this.delayHighpass = null!
    this.delayMixDry = null!
    this.delayMixWet = null!
    this.delayLfo = null!
    this.delayLfoGain = null!
  }

  collectNodes(target: Set<object>): void {
    const nodes: (AudioNode | null)[] = [
      this.combInput, this.combBypass, this.combGate, this.combOutput,
      this.combDelay, this.combFeedback,
      this.chorusInput, this.chorusBypass, this.chorusOutput,
      this.chorusDelayL, this.chorusDelayR, this.chorusDelayC,
      this.chorusLfoL, this.chorusLfoR, this.chorusLfoC,
      this.chorusLfoGainL, this.chorusLfoGainR, this.chorusLfoGainC,
      this.chorusMixDry, this.chorusMixWet,
      this.delayInput, this.delayBypass, this.delayOutput,
      this.delayNode, this.delayFeedbackGain,
      this.delayLowpass, this.delayHighpass,
      this.delayMixDry, this.delayMixWet,
      this.delayLfo, this.delayLfoGain,
    ]
    for (const n of nodes) {
      if (n) target.add(n)
    }
  }
}

registerPlugin('delay', DelayProcessor as unknown as new (ctx: AudioContext) => import('./plugin-registry.js').AudioPlugin)
