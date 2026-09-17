class DecimatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._phase = 0
    this._lastSample = 0
    this._reduction = 1
    this._levels = 65536
    this.port.onmessage = (e) => {
      if (e.data.reduction != null) {
        this._reduction = Math.max(1, Math.min(64, e.data.reduction | 0))
      }
      if (e.data.bits != null) {
        this._levels = Math.pow(2, Math.max(1, Math.min(24, e.data.bits | 0)))
      }
    }
  }

  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || !input.length || !output || !output.length) return true

    for (let ch = 0; ch < input.length && ch < output.length; ch++) {
      const inCh = input[ch]
      const outCh = output[ch]
      for (let i = 0; i < inCh.length; i++) {
        this._phase++
        if (this._phase >= this._reduction) {
          this._phase = 0
          this._lastSample = Math.round(inCh[i] * this._levels) / this._levels
        }
        outCh[i] = this._lastSample
      }
    }
    return true
  }
}

registerProcessor('decimator-processor', DecimatorProcessor)
