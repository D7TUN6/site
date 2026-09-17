export function createSafeParams(sampleRate: number) {
  const nyquist = sampleRate / 2
  return {
    clampFreq(freq: number): number {
      return Math.max(20, Math.min(freq, nyquist - 100))
    },
    clampGain(gain: number): number {
      return Math.max(-40, Math.min(gain, 40))
    },
    clampQ(q: number): number {
      return Math.max(0.001, Math.min(q, 100))
    },
    clampDelayTime(t: number): number {
      return Math.max(0, Math.min(t, 2))
    },
    clampNormalized(v: number): number {
      return Math.max(0, Math.min(v, 1))
    },
    nyquist: nyquist,
  }
}
