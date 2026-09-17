import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { processSubmissionByType } from '../../lib/submission-service.js'

export function createAdminSubmissionsRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/submissions' })
    .get('/', ({ query, set }) => {
      try {
        const status = typeof query.status === 'string' ? query.status.trim() : ''
        let rows: Array<Record<string, unknown>>
        if (status === 'pending' || status === 'approved' || status === 'rejected') {
          rows = db.prepare(
            "select s.id, s.user_id, s.artist_id, s.type, s.status, s.data, s.feedback, s.scheduled_at, s.created_at, u.email as user_email from submissions s left join users u on u.id = s.user_id where s.status = ? order by s.created_at desc"
          ).all(status) as Array<Record<string, unknown>>
        } else {
          rows = db.prepare(
            "select s.id, s.user_id, s.artist_id, s.type, s.status, s.data, s.feedback, s.scheduled_at, s.created_at, u.email as user_email from submissions s left join users u on u.id = s.user_id order by s.created_at desc"
          ).all() as Array<Record<string, unknown>>
        }

        const items = rows.map((r) => {
          let parsed: unknown
          try { parsed = JSON.parse(r.data as string) } catch { parsed = {} }
          return {
            id: r.id,
            userId: r.user_id,
            artistId: r.artist_id,
            type: r.type,
            status: r.status,
            data: parsed,
            feedback: r.feedback,
            scheduledAt: r.scheduled_at,
            createdAt: r.created_at,
            userEmail: r.user_email,
          }
        })

        return { ok: true, submissions: items }
      } catch (err) {
        console.error('admin submissions list failed', err)
        set.status = 500
        return { error: 'failed to list submissions' }
      }
    }, { beforeHandle: requireAdmin })
    .put('/:id/review', ({ params, body, set }) => {
      try {
        const id = Number(params.id)
        if (!Number.isFinite(id)) {
          set.status = 400
          return { error: 'invalid id' }
        }

        const b = (body || {}) as Record<string, unknown>
        const status = typeof b.status === 'string' ? b.status.trim().toLowerCase() : ''
        if (status !== 'approved' && status !== 'rejected') {
          set.status = 400
          return { error: 'status must be approved or rejected' }
        }

        const feedback = typeof b.feedback === 'string' ? b.feedback.trim() : ''

        const row = db.prepare("select id, type, data, artist_id, scheduled_at from submissions where id = ?").get(id) as { id: number; type: string; data: string; artist_id: number | null; scheduled_at: number | null } | undefined
        if (!row) {
          set.status = 404
          return { error: 'submission not found' }
        }

        const now = Date.now()

        if (status === 'rejected') {
          db.prepare("update submissions set status = 'rejected', feedback = ? where id = ?").run(feedback, id)
          return { ok: true, status: 'rejected' }
        }

        let payload: Record<string, unknown>
        try { payload = JSON.parse(row.data) } catch {
          set.status = 400
          return { error: 'invalid submission data' }
        }

        const istoday = row.scheduled_at === null || row.scheduled_at <= now

        if (istoday) {
          const result = processSubmissionByType(db, row, payload)
          if (result?.error) {
            set.status = 400
            return { error: result.error }
          }
        }

        db.prepare("update submissions set status = 'approved', feedback = ? where id = ?").run(feedback, id)

        return { ok: true, status: 'approved', scheduled: !istoday }
      } catch (err) {
        console.error('admin submissions review failed', err)
        set.status = 500
        return { error: 'failed to review submission' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}

export function publishscheduledsubmissions(db: DatabaseSync) {
  const now = Date.now()
  const rows = db.prepare(
    "select id, type, data, artist_id from submissions where status = 'approved' and scheduled_at is not null and scheduled_at <= ?"
  ).all(now) as Array<{ id: number; type: string; data: string; artist_id: number | null }>

  for (const row of rows) {
    try {
      let payload: Record<string, unknown>
      try { payload = JSON.parse(row.data) } catch { continue }

      if (row.type === 'artist_registration' && row.artist_id) {
        db.prepare("update artists set status = 'approved' where id = ?").run(row.artist_id)
      } else {
        processSubmissionByType(db, row, payload)
      }
    } catch (err) {
      console.error('scheduled publish failed for submission', row.id, err)
    }
  }
}
