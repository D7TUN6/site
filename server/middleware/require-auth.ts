import type { RequestHandler } from 'express'

export const requireUser: RequestHandler = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  return next()
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAdmin) return res.status(401).json({ error: 'Unauthorized' })
  return next()
}
