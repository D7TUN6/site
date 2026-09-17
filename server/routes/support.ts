import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { requireUser } from '../middleware/require-auth.js'
import { createSessionPlugin } from '../middleware/session.js'

export function createSupportRouter({ db }: { db: DatabaseSync }) {
  const CATEGORIES = ['technical', 'billing', 'content', 'account', 'feature', 'other'] as const

  return new Elysia({ prefix: '/api/support' })
    .use(createSessionPlugin({ db }))

    // submit a support ticket
    .post('/', ({ body, set, user }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const subject = typeof b.subject === 'string' ? b.subject.trim() : ''
        const message = typeof b.message === 'string' ? b.message.trim() : ''
        const category = typeof b.category === 'string' && CATEGORIES.includes(b.category as typeof CATEGORIES[number]) ? (b.category as string).trim() : 'other'
        if (!subject || !message) {
          set.status = 400
          return { error: 'subject and message are required' }
        }
        if (subject.length > 200) {
          set.status = 400
          return { error: 'subject too long (max 200)' }
        }
        if (message.length > 5000) {
          set.status = 400
          return { error: 'message too long (max 5000)' }
        }
        if (!user) {
          set.status = 401
          return { error: 'unauthorized' }
        }

        const now = Date.now()
        const result = db.prepare(
          "insert into support_tickets (user_id, subject, message, category, status, created_at, updated_at) values (?, ?, ?, ?, 'open', ?, ?)"
        ).run(user.id, subject, message, category, now, now)

        return { ok: true, id: Number(result.lastInsertRowid) }
      } catch (err) {
        console.error('support ticket create failed', err)
        set.status = 500
        return { error: 'failed to create ticket' }
      }
    }, { beforeHandle: requireUser })

    // list current user's tickets
    .get('/', ({ set, user }) => {
      try {
        if (!user) {
          set.status = 401
          return { error: 'unauthorized' }
        }
        const rows = db.prepare(
          "select id, user_id, subject, message, category, status, admin_notes, created_at, updated_at from support_tickets where user_id = ? order by created_at desc"
        ).all(user.id) as Array<{ id: number; user_id: number; subject: string; message: string; category: string; status: string; admin_notes: string; created_at: number; updated_at: number }>

        const tickets = rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          subject: r.subject,
          message: r.message,
          category: r.category,
          status: r.status,
          adminNotes: r.admin_notes,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }))

        return { ok: true, tickets }
      } catch (err) {
        console.error('support tickets list failed', err)
        set.status = 500
        return { error: 'failed to list tickets' }
      }
    }, { beforeHandle: requireUser })

    // get single ticket
    .get('/:id', ({ params, set, user }) => {
      try {
        if (!user) {
          set.status = 401
          return { error: 'unauthorized' }
        }
        const id = Number(params.id)
        if (!Number.isFinite(id) || id <= 0) {
          set.status = 400
          return { error: 'invalid id' }
        }

        const row = db.prepare(
          "select id, user_id, subject, message, category, status, admin_notes, created_at, updated_at from support_tickets where id = ? and user_id = ?"
        ).get(id, user.id) as { id: number; user_id: number; subject: string; message: string; category: string; status: string; admin_notes: string; created_at: number; updated_at: number } | undefined

        if (!row) {
          set.status = 404
          return { error: 'ticket not found' }
        }

        return {
          ok: true,
          ticket: {
            id: row.id,
            userId: row.user_id,
            subject: row.subject,
            message: row.message,
            category: row.category,
            status: row.status,
            adminNotes: row.admin_notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
        }
      } catch (err) {
        console.error('support ticket get failed', err)
        set.status = 500
        return { error: 'failed to get ticket' }
      }
    }, { beforeHandle: requireUser })
}
