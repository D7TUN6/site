import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { hashPassword } from '../../lib/password.js'

function normalizeEmail(raw: unknown) { return typeof raw === 'string' ? raw.trim().toLowerCase() : '' }

export function createAdminUsersRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/users' })
    .get('/', ({ set }) => {
      try {
        const rows = db.prepare('SELECT id, email, email_verified, banned, banned_at, created_at, updated_at FROM users ORDER BY id DESC').all() as Array<{ id: number; email: string; email_verified: number; banned: number; banned_at: number | null; created_at: number; updated_at: number }>
        return { ok: true, users: rows }
      } catch (err) {
        console.error('admin users list failed', err)
        set.status = 500
        return { error: 'Unable to list users' }
      }
    }, { beforeHandle: requireAdmin })
    .patch('/:id', ({ params, body, set }) => {
      try {
        const id = Number(params.id)
        if (!id) {
          set.status = 400
          return { error: 'Invalid id' }
        }
        const existing = db.prepare('SELECT id, email, banned FROM users WHERE id = ?').get(id) as { id: number; email: string; banned: number } | undefined
        if (!existing) {
          set.status = 404
          return { error: 'User not found' }
        }

        const b = (body || {}) as Record<string, unknown>
        const email = typeof b.email === 'string' ? normalizeEmail(b.email) : undefined
        const password = typeof b.password === 'string' ? b.password : undefined
        const ban = b.ban !== undefined ? (b.ban === true || b.ban === 1 ? 1 : 0) : undefined

        if (email && email !== existing.email) {
          if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            set.status = 400
            return { error: 'Invalid email' }
          }
          const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id)
          if (dup) {
            set.status = 409
            return { error: 'Email already in use' }
          }
          db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').run(email, Date.now(), id)
        }

        if (password) {
          if (password.length < 8 || password.length > 200) {
            set.status = 400
            return { error: 'Invalid password length' }
          }
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

        return { ok: true }
      } catch (err) {
        console.error('admin users update failed', err)
        set.status = 500
        return { error: 'Unable to update user' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:id', ({ params, set }) => {
      try {
        const id = Number(params.id)
        if (!id) {
          set.status = 400
          return { error: 'Invalid id' }
        }
        const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id) as { id: number } | undefined
        if (!existing) {
          set.status = 404
          return { error: 'User not found' }
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(id)
        return { ok: true }
      } catch (err) {
        console.error('admin users delete failed', err)
        set.status = 500
        return { error: 'Unable to delete user' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    // Ban user + mass-hide their comments (spec: POST /api/admin/users/:id/ban)
    .post('/:id/ban', ({ params, set }) => {
      try {
        const id = Number(params.id)
        if (!id) {
          set.status = 400
          return { error: 'Invalid id' }
        }
        const existing = db.prepare('SELECT id, email, banned FROM users WHERE id = ?').get(id) as { id: number; email: string; banned: number } | undefined
        if (!existing) {
          set.status = 404
          return { error: 'User not found' }
        }
        const now = Date.now()
        if (!existing.banned) {
          db.prepare('UPDATE users SET banned = 1, banned_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
        }
        db.prepare("UPDATE comments SET status = 'deleted' WHERE author_id = ? AND status != 'deleted'").run(id)
        return { ok: true, banned: true }
      } catch (err) {
        console.error('admin users ban failed', err)
        set.status = 500
        return { error: 'Unable to ban user' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
