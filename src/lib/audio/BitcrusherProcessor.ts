import type { AudioEngineState } from './types.js'
import { identityCurve, makeBitcrusherCurve } from './audio-utils.js'
import { registerPlugin } from './plugin-registry.js'

export class BitcrusherProcessor {
  private ctx: AudioContext
  private _workletReady = false
  private _activeDecimator: 'direct' | 'script' | 'worklet' = 'direct'
  private _decimatorState = { reduction: 2, bits: 8 }

  bcInput!: GainNode
  bcBypass!: GainNode
  bcWaveShaper!: WaveShaperNode
  bcDirectGate!: GainNode
  bcScriptGate!: GainNode
  bcScriptProcessor: AudioNode | null = null
  bitcrusherNode: AudioWorkletNode | null = null
  bcDecimatorSum!: GainNode
  bcOutput!: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.createNodes()
  }

  private createNodes(): void {
    const ctx = this.ctx

    this.bcInput = ctx.createGain()
    this.bcInput.gain.value = 1

    this.bcBypass = ctx.createGain()
    this.bcBypass.gain.value = 1
    this.bcInput.connect(this.bcBypass)

    this.bcWaveShaper = ctx.createWaveShaper()
    this.bcWaveShaper.curve = identityCurve()

    this.bcDirectGate = ctx.createGain()
    this.bcDirectGate.gain.value = 0
    this.bcInput.connect(this.bcDirectGate)
    this.bcDirectGate.connect(this.bcWaveShaper)

    this.bcScriptGate = ctx.createGain()
    this.bcScriptGate.gain.value = 0
    this.bcInput.connect(this.bcScriptGate)

    this.bcDecimatorSum = ctx.createGain()
    this.bcDecimatorSum.gain.value = 1
    this.bcWaveShaper.connect(this.bcDecimatorSum)

    this.bcOutput = ctx.createGain()
    this.bcOutput.gain.value = 1
    this.bcBypass.connect(this.bcOutput)
    this.bcDecimatorSum.connect(this.bcOutput)

    this.bcScriptProcessor = this.createDecimator(ctx)
    if (this.bcScriptProcessor) {
      this.bcScriptGate.connect(this.bcScriptProcessor)
      this.bcScriptProcessor.connect(this.bcDecimatorSum)
      if (this.bitcrusherNode) {
        this._activeDecimator = 'worklet'
      } else {
        this._activeDecimator = 'script'
      }
    } else if (ctx.audioWorklet && !this.isWebKitGTK()) {
      // Worklet available but not yet loaded – will be wired in preloadWorklet()
      this._activeDecimator = 'direct'
    }
  }

  connect(prev: AudioNode): AudioNode {
    prev.connect(this.bcInput)
    return this.bcOutput
  }

  sync(state: AudioEngineState): void {
    const enabled = state.bitcrusherEnabled
    this._decimatorState.reduction = state.reduction
    this._decimatorState.bits = state.bitDepth
    if (enabled) {
      this.bcBypass.gain.value = 0
      this.bcWaveShaper.curve = makeBitcrusherCurve(state.bitDepth)
      this.activateDecimatorPath(this._activeDecimator)
      if (this.bitcrusherNode) {
        this.bitcrusherNode.port.postMessage({
          reduction: state.reduction,
          bits: state.bitDepth,
        })
      }
    } else {
      this.bcBypass.gain.value = 1
      this.bcDirectGate.gain.value = 0
      this.bcScriptGate.gain.value = 0
    }
  }

  private activateDecimatorPath(path: 'direct' | 'script' | 'worklet'): void {
    this._activeDecimator = path
    this.bcBypass.gain.value = 0
    this.bcDirectGate.gain.value = 0
    this.bcScriptGate.gain.value = 0
    switch (path) {
      case 'direct':
        this.bcDirectGate.gain.value = 1
        break
      case 'script':
      case 'worklet':
        this.bcScriptGate.gain.value = 1
        break
    }
  }

  private isWebKitGTK(): boolean {
    return typeof navigator !== 'undefined' && /WebKitGTK|GTK\)/.test(navigator.userAgent)
  }

  async preloadWorklet(): Promise<void> {
    if (this._workletReady || this.isWebKitGTK() || !this.ctx.audioWorklet) return
    try {
      await this.ctx.audioWorklet.addModule('/decimator-processor.js')
      this._workletReady = true
      // If we previously deferred decimator creation, wire up the worklet now
      if (!this.bitcrusherNode && !this.bcScriptProcessor) {
        try {
          const node = new AudioWorkletNode(this.ctx, 'decimator-processor')
          this.bitcrusherNode = node
          this.bcScriptProcessor = node
          this.bcScriptGate.connect(node)
          node.connect(this.bcDecimatorSum)
          this._activeDecimator = 'worklet'
          // Sync current state
          node.port.postMessage({ reduction: this._decimatorState.reduction, bits: this._decimatorState.bits })
        } catch {
          console.warn('AudioWorkletNode creation failed after preload')
        }
      } else if (this.bitcrusherNode) {
        // Already have worklet – ensure params are synced
        this.bitcrusherNode.port.postMessage({ reduction: this._decimatorState.reduction, bits: this._decimatorState.bits })
      }
    } catch {
      console.warn('AudioWorklet not available — will use ScriptProcessorNode')
      // Fallback to ScriptProcessor if worklet failed and none exists yet
      if (!this.bcScriptProcessor && typeof this.ctx.createScriptProcessor === 'function') {
        const fallback = this.createDecimator(this.ctx)
        if (fallback) {
          this.bcScriptProcessor = fallback
          this.bcScriptGate.connect(fallback)
          fallback.connect(this.bcDecimatorSum)
          this._activeDecimator = (fallback === this.bitcrusherNode) ? 'worklet' : 'script'
        }
      }
    }
  }

  private createDecimator(ctx: AudioContext): AudioNode | null {
    if (this._workletReady) {
      try {
        const node = new AudioWorkletNode(ctx, 'decimator-processor')
        this.bitcrusherNode = node
        return node
      } catch {
        console.warn('AudioWorkletNode creation failed — falling back to ScriptProcessorNode')
      }
    }

    // If AudioWorklet is available, defer to worklet instead of deprecated ScriptProcessor
    if (ctx.audioWorklet && !this.isWebKitGTK() && !this._workletReady) {
      return null
    }

    if (typeof ctx.createScriptProcessor !== 'function') return null
    try {
      const sp = ctx.createScriptProcessor(1024, 1, 1)
      let counter = 0
      let currentSample = 0
      const st = this._decimatorState
      sp.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0)
        const output = e.outputBuffer.getChannelData(0)
        const levels = Math.pow(2, st.bits)
        for (let i = 0; i < input.length; i++) {
          counter++
          if (counter >= st.reduction) {
            counter = 0
            currentSample = Math.round(input[i] * levels) / levels
          }
          output[i] = currentSample
        }
      }
      return sp
    } catch {
      console.warn('ScriptProcessorNode creation failed')
      return null
    }
  }

  updateDecimatorParams(reduction: number, bits: number): void {
    this._decimatorState.reduction = reduction
    this._decimatorState.bits = bits
    if (this.bitcrusherNode) {
      this.bitcrusherNode.port.postMessage({ reduction, bits })
    }
  }

  resetRefs(): void {
    this.bcInput = null!
    this.bcBypass = null!
    this.bcWaveShaper = null!
    this.bcDirectGate = null!
    this.bcScriptGate = null!
    this.bcScriptProcessor = null
    this.bitcrusherNode = null
    this.bcDecimatorSum = null!
    this.bcOutput = null!
    this._workletReady = false
    this._activeDecimator = 'direct'
  }

  collectNodes(target: Set<object>): void {
    const nodes: (AudioNode | null)[] = [
      this.bcInput, this.bcBypass, this.bcWaveShaper,
      this.bcDirectGate, this.bcScriptGate, this.bcDecimatorSum,
      this.bcOutput, this.bcScriptProcessor, this.bitcrusherNode,
    ]
    for (const n of nodes) {
      if (n) target.add(n)
    }
  }
}

registerPlugin('bitcrusher', BitcrusherProcessor as unknown as new (ctx: AudioContext) => import('./plugin-registry.js').AudioPlugin)
