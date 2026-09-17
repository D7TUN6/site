import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { requireUser } from '../middleware/require-auth.js'
import { createSessionPlugin } from '../middleware/session.js'

const validtypes = new Set(['artist_registration', 'release', 'media_photo', 'media_video', 'shop_product'])

export function createSubmissionsRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/submissions' })
    .use(createSessionPlugin({ db }))

    .post('/', ({ body, set, user }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const type = typeof b.type === 'string' ? b.type : ''
        if (!validtypes.has(type)) {
          set.status = 400
          return { error: 'invalid submission type' }
        }

        const data = typeof b.data === 'object' && b.data !== null ? b.data : {}
        const now = Date.now()

        const result = db.prepare(
          "insert into submissions (user_id, type, status, data, feedback, created_at) values (?, ?, 'pending', ?, '', ?)"
        ).run(user!.id, type, JSON.stringify(data), now)

        set.status = 201
        return { ok: true, id: Number(result.lastInsertRowid) }
      } catch (err) {
        console.error('submissions create failed', err)
        set.status = 500
        return { error: 'failed to create submission' }
      }
    }, { beforeHandle: requireUser })

    .get('/:id', ({ params, set, user }) => {
      try {
        const id = Number(params.id)
        if (!Number.isFinite(id)) {
          set.status = 400
          return { error: 'invalid id' }
        }

        const row = db.prepare(
          "select id, user_id, type, status, data, feedback, scheduled_at, created_at from submissions where id = ?"
        ).get(id) as { id: number; user_id: number; type: string; status: string; data: string; feedback: string; scheduled_at: number | null; created_at: number } | undefined

        if (!row) {
          set.status = 404
          return { error: 'not found' }
        }
        if (row.user_id !== user!.id) {
          set.status = 403
          return { error: 'forbidden' }
        }

        let parsed: unknown
        try { parsed = JSON.parse(row.data) } catch { parsed = {} }

        return {
          ok: true,
          submission: {
            id: row.id,
            type: row.type,
            status: row.status,
            data: parsed,
            feedback: row.feedback,
            scheduledAt: row.scheduled_at,
            createdAt: row.created_at,
          },
        }
      } catch (err) {
        console.error('submissions get failed', err)
        set.status = 500
        return { error: 'failed to get submission' }
      }
    }, { beforeHandle: requireUser })

    .put('/:id', ({ params, body, set, user }) => {
      try {
        const id = Number(params.id)
        if (!Number.isFinite(id)) {
          set.status = 400
          return { error: 'invalid id' }
        }

        const row = db.prepare(
          "select id, user_id, type, status from submissions where id = ?"
        ).get(id) as { id: number; user_id: number; type: string; status: string } | undefined

        if (!row) {
          set.status = 404
          return { error: 'not found' }
        }
        if (row.user_id !== user!.id) {
          set.status = 403
          return { error: 'forbidden' }
        }
        if (row.status !== 'rejected') {
          set.status = 400
          return { error: 'can only update rejected submissions' }
        }

        const b = (body || {}) as Record<string, unknown>
        const type = typeof b.type === 'string' ? b.type : row.status
        const data = typeof b.data === 'object' && b.data !== null ? b.data : {}
        const now = Date.now()

        db.prepare(
          "update submissions set type = ?, data = ?, status = 'pending', feedback = '', created_at = ? where id = ?"
        ).run(type, JSON.stringify(data), now, id)

        return { ok: true }
      } catch (err) {
        console.error('submissions update failed', err)
        set.status = 500
        return { error: 'failed to update submission' }
      }
    }, { beforeHandle: requireUser })
}
