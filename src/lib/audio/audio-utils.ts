export function identityCurve(): Float32Array<ArrayBuffer> {
  const c = new Float32Array(256) as Float32Array<ArrayBuffer>
  for (let i = 0; i < 256; i++) c[i] = (i / 127.5) - 1
  return c
}

export function makeBitcrusherCurve(bits: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(256) as Float32Array<ArrayBuffer>
  const levels = Math.pow(2, Math.round(bits))
  for (let i = 0; i < 256; i++) {
    const x = (i / 127.5) - 1
    curve[i] = Math.round(x * levels) / levels
  }
  return curve
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
