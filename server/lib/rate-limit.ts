import { registerCleanup } from './cleanup.js'

// NOTE: In-memory rate limiter. Each server instance tracks its own counters,
// so a client hitting multiple instances gets a separate budget per instance.
// Sufficient for single-instance self-hosted deployments. For multi-instance
// deployments, consider Redis-backed rate limiting.

export function createRateLimiter(maxRequests: number, windowMs: number, maxKeys = 100_000) {
  const map = new Map<string, { count: number; resetAt: number }>()

  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of map) {
      if (now > entry.resetAt) map.delete(key)
    }
    if (map.size > maxKeys) {
      const entries = [...map.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
      const toDelete = entries.slice(0, entries.length - maxKeys)
      for (const [key] of toDelete) map.delete(key)
    }
  }, 60_000)
  cleanup.unref()
  registerCleanup(() => clearInterval(cleanup))

  return function check(key: string): boolean {
    if (map.size >= maxKeys) return false
    const now = Date.now()
    const entry = map.get(key)
    if (!entry || now > entry.resetAt) {
      map.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (entry.count >= maxRequests) return false
    entry.count++
    return true
  }
}
