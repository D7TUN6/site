export type ProfileFilter = {
  type: 'peaking' | 'lowshelf' | 'highshelf'
  frequency: number
  gain: number
  q: number
}

export type EqPresetName =
  | 'techno'
  | 'enhanced-bass'
  | 'enhanced-bass-treble'
  | 'enhanced-treble'
  | 'laptop-speakers'
  | 'live'
  | 'large-hall'
  | 'd7tun6-low-mid-scoop'
  | 'manual'

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
export const EQ_TYPES: BiquadFilterType[] = [
  'lowshelf', 'peaking', 'peaking', 'peaking',
  'peaking', 'peaking', 'peaking', 'peaking',
  'peaking', 'highshelf',
]

export const EQ_PRESETS: Record<EqPresetName, number[]> = {
  techno:               [6, 4, 6, -2, -4, -2, 0, 3, 5, 6],
  'enhanced-bass':      [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'enhanced-bass-treble': [6, 4, 2, 0, 0, 0, 2, 4, 6, 8],
  'enhanced-treble':    [-4, -2, 0, 0, 0, 2, 4, 6, 8, 10],
  'laptop-speakers':    [-12, -10, -8, -4, 2, 6, 4, 0, -4, -8],
  live:                 [0, 0, 1, 2, 3, 3, 2, 2, 1, 0],
  'large-hall':         [0, 0, 0, 0, 0, 0, 0, -2, -4, -6],
  'd7tun6-low-mid-scoop': [0, 5, 4, -0.5, 0, 2, 4.5, 4.5, 6, 0],
  manual:               [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}

export type Quality = 'extreme_lobit' | 'low' | 'medium' | 'high' | 'superb'

export type CassetteType = 'type_i' | 'type_ii' | 'type_iii' | 'type_iv'

export type DeckType = 'chinese_walkman' | 'tanashin' | 'technics' | 'nakamichi'

export type CassetteEqSpec = {
  highpass: number
  lowshelfFreq: number
  lowshelfGain: number
  peakFreq: number
  peakGain: number
  peakQ: number
  lowpassFreq: number
}

export const CASSETTE_PRESETS: Record<CassetteType, CassetteEqSpec> = {
  type_i:   { highpass: 40,  lowshelfFreq: 100, lowshelfGain: 2,   peakFreq: 2500, peakGain: -1, peakQ: 1,   lowpassFreq: 14000 },
  type_ii:  { highpass: 30,  lowshelfFreq: 80,  lowshelfGain: 1,   peakFreq: 3000, peakGain: 0.5, peakQ: 0.8, lowpassFreq: 16000 },
  type_iii: { highpass: 30,  lowshelfFreq: 90,  lowshelfGain: 1.5, peakFreq: 2000, peakGain: 2,  peakQ: 0.7, lowpassFreq: 16000 },
  type_iv:  { highpass: 20,  lowshelfFreq: 60,  lowshelfGain: 0,   peakFreq: 3500, peakGain: 1,  peakQ: 0.9, lowpassFreq: 18000 },
}

export type AudioEngineState = {
  eqGains: number[]
  eqPreset: EqPresetName
  autoEqModel: string | null
  autoEqFilters: ProfileFilter[]
  tapeEnabled: boolean
  tapeSaturation: number
  cassetteType: CassetteType
  tapeBias: number
  tapeNoise: number
  tapeWow: number
  tapeFlutter: number
  deckMechanism: DeckType
  tanashinWear: number
  dolbyC: boolean
  reverbEnabled: boolean
  reverbMix: number
  quality: Quality
  bitcrusherEnabled: boolean
  bitDepth: number
  reduction: number
  combEnabled: boolean
  combDelayMs: number
  combResonance: number
  chorusEnabled: boolean
  chorusRate: number
  chorusDepth: number
  chorusMix: number
  delayEnabled: boolean
  delayTime: number
  delayFeedback: number
  delayMix: number
  normalizationMode: 'standard' | 'loud' | 'off'
}

export function makeTapeCurve(k: number, range: number = 1): Float32Array<ArrayBuffer> {
  const n = 256
  const curve = new Float32Array(n) as Float32Array<ArrayBuffer>
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = ((1 + k) * x) / (1 + k * range * Math.abs(x))
  }
  return curve
}

export function generateImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * duration)
  const buffer = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay * 3)
      data[i] = (Math.random() * 2 - 1) * env
    }
  }
  return buffer
}

export function generatePinkNoise(ctx: AudioContext, duration: number): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * duration)
  const buffer = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
    }
  }
  return buffer
}
