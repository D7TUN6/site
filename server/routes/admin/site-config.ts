import express from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'

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

export function getSiteConfig(db: DatabaseSync): Record<string, string> {
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
  const router = express.Router()

  router.get('/', requireAdmin, (_req, res) => {
    try {
      const config = getSiteConfig(db)
      const features = getFeatureFlags(db)
      const data: Record<string, string | boolean> = { ...config }
      for (const [key, val] of Object.entries(features)) data[`feature_${key}`] = val
      return res.json({ ok: true, config: data })
    } catch (err) {
      console.error('admin site-config get failed', err)
      return res.status(500).json({ error: 'Unable to get config' })
    }
  })

  router.post('/', enforceSameOrigin, requireAdmin, (req, res) => {
    try {
      const updates = req.body?.config as Record<string, unknown> | undefined
      if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'config object required' })
      const upsert = db.prepare('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)')
      const del = db.prepare('DELETE FROM site_config WHERE key = ?')
      for (const [key, val] of Object.entries(updates)) {
        if (val === true || val === 'true') del.run(key)
        else if (val === false || val === 'false') upsert.run(key, 'false')
        else upsert.run(key, String(val))
      }
      return res.json({ ok: true })
    } catch (err) {
      console.error('admin site-config post failed', err)
      return res.status(500).json({ error: 'Unable to update config' })
    }
  })

  return router
}
