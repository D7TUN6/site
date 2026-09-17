/**
 * Hybrid device-power detector (tier 0..4) for modern browsers (level-3).
 *
 * Strategy:
 *  - If `navigator.deviceMemory` (Chromium) is present it feeds the primary
 *    score; it is combined with a tiny background microbenchmark.
 *  - Firefox/WebKit lack `deviceMemory`, so the microbenchmark (CPU math +
 *    Canvas/OffscreenCanvas 2D fills) is the cross-browser measurement.
 *  - Results are cached in `localStorage['sys_perf_tier']`; the cached value is
 *    applied synchronously by an inline <script> in the server-rendered shell
 *    so the right tier gates CSS before first paint. A fresh benchmark only
 *    runs when no cached value exists (or `force` is passed).
 */

export type DeviceTier = 0 | 1 | 2 | 3 | 4

export const TIER_KEY = 'sys_perf_tier'
const TIER_CLASSES: ReadonlyArray<string> = ['tier-0', 'tier-1', 'tier-2', 'tier-3', 'tier-4']

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number
}

export function readCachedTier(): DeviceTier | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TIER_KEY)
    if (raw === null) return null
    const parsed = Number.parseInt(raw, 10)
    return parsed >= 0 && parsed <= 4 ? (parsed as DeviceTier) : null
  } catch {
    return null
  }
}

export function applyTier(tier: DeviceTier): void {
  const root = document.documentElement
  for (const cls of TIER_CLASSES) root.classList.remove(cls)
  root.classList.add(`tier-${tier}`)
}

export function getDeviceTier(): DeviceTier {
  const cls = document.documentElement.className
  const match = /(?:^|\s)tier-([0-4])(?:\s|$)/.exec(cls)
  return match ? (Number(match[1]) as DeviceTier) : detectDeviceTier()
}

export interface MicroBenchmarkResult {
  cpuMs: number
  gpuMs: number
}

/** CPU math probe + 2D rasterization probe, both sub-millisecond on desktop. */
export function runMicroBenchmark(): MicroBenchmarkResult {
  const cpuStart = performance.now()
  let acc = 0
  for (let i = 0; i < 15000; i++) {
    acc += Math.sqrt(i) * Math.sin(i)
  }
  const cpuMs = performance.now() - cpuStart

  const isOffscreen = typeof OffscreenCanvas !== 'undefined'
  const canvas = isOffscreen ? new OffscreenCanvas(64, 64) : document.createElement('canvas')
  const gpuStart = performance.now()
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (ctx) {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ff0055' : '#00ff55'
      ctx.fillRect(0, 0, 64, 64)
    }
  }
  const gpuMs = performance.now() - gpuStart
  void acc
  return { cpuMs, gpuMs }
}

export function detectDeviceTier(force = false): DeviceTier {
  if (typeof window === 'undefined') return 2

  if (!force) {
    const cached = readCachedTier()
    if (cached !== null) {
      applyTier(cached)
      return cached
    }
  }

  const nav = navigator as NavigatorWithMemory
  const cores = nav.hardwareConcurrency || 2
  const memory = nav.deviceMemory || 0 // 0 when Firefox/WebKit
  const dpr = window.devicePixelRatio || 1

  const bench = runMicroBenchmark()
  const benchMs = bench.cpuMs + bench.gpuMs

  let score = 0

  // Chromium memory probe (if exposed)
  if (memory >= 8) score += 35
  else if (memory >= 4) score += 20
  else if (memory >= 2) score += 10

  // CPU cores probe (all engines)
  if (cores >= 8) score += 30
  else if (cores >= 4) score += 20
  else if (cores >= 2) score += 10

  // Microbenchmark (universal for Firefox / WebKit / Safari)
  if (benchMs < 2.5) score += 40
  else if (benchMs < 6.0) score += 25
  else if (benchMs < 15.0) score += 10

  if (dpr >= 2 && benchMs < 5.0) score += 5

  let tier: DeviceTier = 0
  if (score >= 80) tier = 4
  else if (score >= 60) tier = 3
  else if (score >= 40) tier = 2
  else if (score >= 20) tier = 1

  applyTier(tier)
  try {
    window.localStorage.setItem(TIER_KEY, String(tier))
  } catch {
    // storage unavailable (e.g. private mode) — tier still applies this session
  }
  return tier
}