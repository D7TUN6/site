import type { DatabaseSync } from '../lib/sqlite.js'
import { getFeatureFlags } from '../routes/admin/site-config.js'

let _db: DatabaseSync | null = null
let _ready = false
let _cache: Record<string, boolean> | null = null
let _cacheTime = 0
const CACHE_TTL_MS = 60_000

export function initFeatureToggle(db: DatabaseSync) {
  _db = db
  _ready = true
}

export function invalidateFeatureCache() {
  _cache = null
}

export function requireFeature(feature: string) {
  return ({ set }: { set: { status?: number | string } }) => {
    if (!_ready) {
      set.status = 503
      return { error: 'Service not yet initialized' }
    }
    const now = Date.now()
    if (!_cache || now - _cacheTime > CACHE_TTL_MS) {
      _cache = getFeatureFlags(_db!)
      _cacheTime = now
    }
    if (_cache[feature] === false) {
      set.status = 503
      return { error: 'This section is currently disabled for maintenance' }
    }
  }
}
