import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'

export function createAdminSupportRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/support' })
    // list all tickets
    .get('/', ({ query, set }) => {
      try {
        const status = typeof query.status === 'string' ? query.status.trim() : ''
        let rows: Array<Record<string, unknown>>
        if (['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
          rows = db.prepare(
            "select t.id, t.user_id, t.subject, t.message, t.category, t.status, t.admin_notes, t.created_at, t.updated_at, u.email as user_email from support_tickets t left join users u on u.id = t.user_id where t.status = ? order by t.created_at desc"
          ).all(status) as Array<Record<string, unknown>>
        } else {
          rows = db.prepare(
            "select t.id, t.user_id, t.subject, t.message, t.category, t.status, t.admin_notes, t.created_at, t.updated_at, u.email as user_email from support_tickets t left join users u on u.id = t.user_id order by t.created_at desc"
          ).all() as Array<Record<string, unknown>>
        }

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
          userEmail: r.user_email,
        }))

        return { ok: true, tickets }
      } catch (err) {
        console.error('admin support tickets list failed', err)
        set.status = 500
        return { error: 'failed to list tickets' }
      }
    }, { beforeHandle: requireAdmin })
    // update ticket status / admin notes
    .put('/:id', ({ params, body, set }) => {
      try {
        const id = Number(params.id)
        if (!Number.isFinite(id)) {
          set.status = 400
          return { error: 'invalid id' }
        }

        const b = (body || {}) as Record<string, unknown>
        const status = typeof b.status === 'string' ? b.status.trim() : ''
        const adminNotes = typeof b.adminNotes === 'string' ? b.adminNotes.trim() : ''

        if (status && !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
          set.status = 400
          return { error: 'invalid status' }
        }

        const now = Date.now()

        if (status && adminNotes) {
          db.prepare("update support_tickets set status = ?, admin_notes = ?, updated_at = ? where id = ?").run(status, adminNotes, now, id)
        } else if (status) {
          db.prepare("update support_tickets set status = ?, updated_at = ? where id = ?").run(status, now, id)
        } else if (adminNotes) {
          db.prepare("update support_tickets set admin_notes = ?, updated_at = ? where id = ?").run(adminNotes, now, id)
        } else {
          set.status = 400
          return { error: 'nothing to update' }
        }

        return { ok: true }
      } catch (err) {
        console.error('admin support ticket update failed', err)
        set.status = 500
        return { error: 'failed to update ticket' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
