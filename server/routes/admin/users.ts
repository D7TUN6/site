import express from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { hashPassword } from '../../lib/password.js'

function normalizeEmail(raw: unknown) { return typeof raw === 'string' ? raw.trim().toLowerCase() : '' }

export function createAdminUsersRouter({ db }: { db: DatabaseSync }) {
  const router = express.Router()

  router.get('/', requireAdmin, (_req, res) => {
    try {
      const rows = db.prepare('SELECT id, email, email_verified, banned, banned_at, created_at, updated_at FROM users ORDER BY id DESC').all() as Array<{ id: number; email: string; email_verified: number; banned: number; banned_at: number | null; created_at: number; updated_at: number }>
      return res.json({ ok: true, users: rows })
    } catch (err) {
      console.error('admin users list failed', err)
      return res.status(500).json({ error: 'Unable to list users' })
    }
  })

  router.patch('/:id', enforceSameOrigin, requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ error: 'Invalid id' })
      const existing = db.prepare('SELECT id, email, banned FROM users WHERE id = ?').get(id) as { id: number; email: string; banned: number } | undefined
      if (!existing) return res.status(404).json({ error: 'User not found' })

      const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : undefined
      const password = typeof req.body?.password === 'string' ? req.body.password : undefined
      const ban = req.body?.ban !== undefined ? (req.body.ban === true || req.body.ban === 1 ? 1 : 0) : undefined

      if (email && email !== existing.email) {
        if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' })
        const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id)
        if (dup) return res.status(409).json({ error: 'Email already in use' })
        db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').run(email, Date.now(), id)
      }

      if (password) {
        if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Invalid password length' })
        const pwHash = hashPassword(password)
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(pwHash, Date.now(), id)
      }

      if (ban !== undefined) {
        if (ban && !existing.banned) {
          db.prepare('UPDATE users SET banned = 1, banned_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id)
        } else if (!ban && existing.banned) {
          db.prepare('UPDATE users SET banned = 0, banned_at = NULL, updated_at = ? WHERE id = ?').run(Date.now(), id)
        }
      }

      return res.json({ ok: true })
    } catch (err) {
      console.error('admin users update failed', err)
      return res.status(500).json({ error: 'Unable to update user' })
    }
  })

  router.delete('/:id', enforceSameOrigin, requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ error: 'Invalid id' })
      const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id) as { id: number } | undefined
      if (!existing) return res.status(404).json({ error: 'User not found' })
      db.prepare('DELETE FROM users WHERE id = ?').run(id)
      return res.json({ ok: true })
    } catch (err) {
      console.error('admin users delete failed', err)
      return res.status(500).json({ error: 'Unable to delete user' })
    }
  })

  return router
}
