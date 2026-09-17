import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { invalidateFeatureCache } from '../../middleware/feature-toggle.js'

const DEFAULT_FEATURES: Record<string, boolean> = {
  releases: true,
  gallery: true,
  video: true,
  radio: true,
  shop: true,
  cart: true,
  orders: true,
  donate: true,
  account: true,
  registration: true,
  news: true,
  blog: true,
  projects: true,
}

const ALLOWED_FEATURE_KEYS = new Set(Object.keys(DEFAULT_FEATURES))

function getSiteConfig(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM site_config').all() as Array<{ key: string; value: string }>
  const config: Record<string, string> = {}
  for (const row of rows) config[row.key] = row.value
  return config
}

export function getFeatureFlags(db: DatabaseSync): Record<string, boolean> {
  const config = getSiteConfig(db)
  const features = { ...DEFAULT_FEATURES }
  for (const key of Object.keys(features)) {
    const val = config[`feature_${key}`]
    if (val === 'false') features[key] = false
  }
  return features
}

export function createAdminSiteConfigRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/site-config' })
    .get('/', ({ set }) => {
      try {
        const config = getSiteConfig(db)
        const features = getFeatureFlags(db)
        const data: Record<string, string | boolean> = { ...config }
        for (const [key, val] of Object.entries(features)) data[`feature_${key}`] = val
        return { ok: true, config: data }
      } catch (err) {
        console.error('admin site-config get failed', err)
        set.status = 500
        return { error: 'Unable to get config' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/', ({ body, set }) => {
      try {
        const updates = (body as { config?: Record<string, unknown> } | undefined)?.config
        if (!updates || typeof updates !== 'object') {
          set.status = 400
          return { error: 'config object required' }
        }
        const upsert = db.prepare('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)')
        const del = db.prepare('DELETE FROM site_config WHERE key = ?')
        for (const [key, val] of Object.entries(updates)) {
          if (key.startsWith('feature_')) {
            const featureName = key.slice('feature_'.length)
            if (!ALLOWED_FEATURE_KEYS.has(featureName)) continue
          }
          if (val === true || val === 'true') del.run(key)
          else if (val === false || val === 'false') upsert.run(key, 'false')
          else upsert.run(key, String(val))
        }
        invalidateFeatureCache()
        return { ok: true }
      } catch (err) {
        console.error('admin site-config post failed', err)
        set.status = 500
        return { error: 'Unable to update config' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
