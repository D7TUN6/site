import type { AudioEngineState } from './types.js'
import { generateImpulseResponse } from './types.js'
import { clamp01 } from './audio-utils.js'
import { registerPlugin } from './plugin-registry.js'

let impulseResponseCache: { ctx: AudioContext; buffer: AudioBuffer } | null = null

export class ReverbProcessor {
  private ctx: AudioContext
  reverbNode!: ConvolverNode
  reverbWet!: GainNode
  reverbDry!: GainNode
  output!: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.createNodes()
  }

  private createNodes(): void {
    const ctx = this.ctx

    this.reverbNode = ctx.createConvolver()
    if (!impulseResponseCache || impulseResponseCache.ctx !== ctx) {
      impulseResponseCache = { ctx, buffer: generateImpulseResponse(ctx, 2.5, 0.8) }
    }
    this.reverbNode.buffer = impulseResponseCache.buffer

    this.reverbDry = ctx.createGain()
    this.reverbDry.gain.value = 1

    this.reverbWet = ctx.createGain()
    this.reverbWet.gain.value = 0
    this.reverbNode.connect(this.reverbWet)

    this.output = ctx.createGain()
    this.output.gain.value = 1
    this.reverbDry.connect(this.output)
    this.reverbWet.connect(this.output)
  }

  connect(prev: AudioNode): AudioNode {
    prev.connect(this.reverbNode)
    prev.connect(this.reverbDry)
    return this.output
  }

  sync(state: AudioEngineState): void {
    const enabled = state.reverbEnabled
    if (enabled) {
      const mix = clamp01(state.reverbMix)
      this.reverbDry.gain.value = 1 - mix
      this.reverbWet.gain.value = mix * 0.8
    } else {
      this.reverbDry.gain.value = 1
      this.reverbWet.gain.value = 0
    }
  }

  resetRefs(): void {
    this.reverbNode = null!
    this.reverbWet = null!
    this.reverbDry = null!
    this.output = null!
  }

  collectNodes(target: Set<object>): void {
    const nodes: (AudioNode | null)[] = [
      this.reverbNode, this.reverbWet, this.reverbDry,
      this.output,
    ]
    for (const n of nodes) {
      if (n) target.add(n)
    }
  }
}

registerPlugin('reverb', ReverbProcessor as unknown as new (ctx: AudioContext) => import('./plugin-registry.js').AudioPlugin)
