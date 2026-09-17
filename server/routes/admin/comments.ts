import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'

export function createAdminCommentsRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/comments' })
    .get('/', ({ query, set }) => {
      try {
        const status = typeof query['status'] === 'string' && ['pending', 'approved', 'deleted'].includes(query['status'] as string)
          ? query['status'] as string
          : null
        const sql = `
          SELECT c.id, c.post_slug, c.author_id, c.parent_id, c.content, c.status, c.created_at, u.email, u.banned
          FROM comments c
          LEFT JOIN users u ON u.id = c.author_id
          ${status ? 'WHERE c.status = ?' : ''}
          ORDER BY c.created_at DESC
          LIMIT 500
        `
        const rows = status
          ? db.prepare(sql).all(status)
          : db.prepare(sql).all()
        return { ok: true, status, comments: rows as Array<Record<string, unknown>> }
      } catch (err) {
        console.error('admin comments list failed', err)
        set.status = 500
        return { error: 'Unable to list comments' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/:id/approve', ({ params, set }) => {
      try {
        const id = Number(params.id)
        if (!id) {
          set.status = 400
          return { error: 'Invalid id' }
        }
        const existing = db.prepare('SELECT id FROM comments WHERE id = ?').get(id) as { id: number } | undefined
        if (!existing) {
          set.status = 404
          return { error: 'Comment not found' }
        }
        db.prepare("UPDATE comments SET status = 'approved' WHERE id = ?").run(id)
        return { ok: true, id }
      } catch (err) {
        console.error('admin comments approve failed', err)
        set.status = 500
        return { error: 'Unable to approve comment' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:id', ({ params, set }) => {
      try {
        const id = Number(params.id)
        if (!id) {
          set.status = 400
          return { error: 'Invalid id' }
        }
        const existing = db.prepare('SELECT id FROM comments WHERE id = ?').get(id) as { id: number } | undefined
        if (!existing) {
          set.status = 404
          return { error: 'Comment not found' }
        }
        db.prepare("UPDATE comments SET status = 'deleted' WHERE id = ? OR parent_id = ?").run(id, id)
        return { ok: true, id }
      } catch (err) {
        console.error('admin comments delete failed', err)
        set.status = 500
        return { error: 'Unable to delete comment' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}