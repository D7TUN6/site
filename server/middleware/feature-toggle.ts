import type { Request, Response, NextFunction } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { getFeatureFlags } from '../routes/admin/site-config.js'

let _db: DatabaseSync | null = null

export function initFeatureToggle(db: DatabaseSync) {
  _db = db
}

export function requireFeature(feature: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!_db) return next()
    const flags = getFeatureFlags(_db)
    if (flags[feature] === false) {
      return res.status(503).json({ error: 'This section is currently disabled for maintenance' })
    }
    next()
  }
}
