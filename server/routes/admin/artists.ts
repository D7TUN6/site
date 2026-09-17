import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artist'
}

function uniqueSlug(db: DatabaseSync, base: string): string {
  let slug = base
  let n = 0
  while (db.prepare("select id from artists where slug = ?").get(slug)) {
    n++
    slug = `${base}-${n}`
  }
  return slug
}

export function createAdminArtistsRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/artists' })
    .get('/', ({ set }) => {
      try {
        const rows = db.prepare(
          "select id, user_id, name, slug, bio, avatar_url, status, verified, feedback_message, created_at from artists order by name asc"
        ).all() as Array<{ id: number; user_id: number | null; name: string; slug: string; bio: string; avatar_url: string; status: string; verified: number; feedback_message: string; created_at: number }>
        return { ok: true, artists: rows }
      } catch (err) {
        console.error('admin artists list failed', err)
        set.status = 500
        return { error: 'failed to list artists' }
      }
    }, { beforeHandle: requireAdmin })
    // ─── Artist Applications (moderation) ───
    .get('/applications', ({ set }) => {
      try {
        const rows = db.prepare(
          "select s.id, s.user_id, s.type, s.status, s.data, s.feedback, s.created_at, u.email as user_email from submissions s left join users u on u.id = s.user_id where s.type = 'artist_registration' order by s.created_at desc"
        ).all() as Array<{ id: number; user_id: number; type: string; status: string; data: string; feedback: string; created_at: number; user_email: string | null }>

        const applications = rows.map((r) => {
          let parsed: Record<string, unknown> = {}
          try { parsed = JSON.parse(r.data) } catch { /* invalid JSON — keep default */ }

          let status = r.status
          let feedback = r.feedback
          if (status === 'rejected' && feedback.startsWith('sent_back:')) {
            status = 'sent_back'
            feedback = feedback.slice('sent_back:'.length).trim()
          }

          return {
            id: r.id,
            userId: r.user_id,
            name: typeof parsed.name === 'string' ? parsed.name : '',
            bio: typeof parsed.bio === 'string' ? parsed.bio : '',
            links: typeof parsed.links === 'string' ? parsed.links : '',
            status,
            feedback,
            createdAt: r.created_at,
            userEmail: r.user_email,
          }
        })

        return { ok: true, applications }
      } catch (err) {
        console.error('admin artists applications list failed', err)
        set.status = 500
        return { error: 'failed to list applications' }
      }
    }, { beforeHandle: requireAdmin })
    .put('/applications/:id/review', ({ params, body, set }) => {
      try {
        const id = Number(params.id)
        if (!Number.isFinite(id)) {
          set.status = 400
          return { error: 'invalid id' }
        }

        const b = (body || {}) as Record<string, unknown>
        const status = typeof b.status === 'string' ? b.status.trim().toLowerCase() : ''
        if (!['approved', 'rejected', 'sent_back'].includes(status)) {
          set.status = 400
          return { error: 'status must be approved, rejected, or sent_back' }
        }

        const feedback = typeof b.feedback === 'string' ? b.feedback.trim() : ''

        const submission = db.prepare(
          "select id, user_id, data from submissions where id = ?"
        ).get(id) as { id: number; user_id: number | null; data: string } | undefined

        if (!submission) {
          set.status = 404
          return { error: 'submission not found' }
        }

        let parsed: Record<string, unknown> = {}
          try { parsed = JSON.parse(submission.data) } catch { /* invalid JSON — keep default */ }

        const now = Date.now()

        if (status === 'sent_back') {
          db.prepare(
            "update submissions set status = 'rejected', feedback = ? where id = ?"
          ).run(`sent_back: ${feedback}`, id)

          if (submission.user_id) {
            db.prepare(
              "update artists set status = 'rejected', feedback_message = ? where user_id = ?"
            ).run(`sent_back: ${feedback}`, submission.user_id)
          }

          return { ok: true, status: 'sent_back' }
        }

        if (status === 'rejected') {
          db.prepare(
            "update submissions set status = 'rejected', feedback = ? where id = ?"
          ).run(feedback, id)

          if (submission.user_id) {
            db.prepare(
              "update artists set status = 'rejected', feedback_message = ? where user_id = ?"
            ).run(feedback, submission.user_id)
          }

          return { ok: true, status: 'rejected' }
        }

        if (status === 'approved') {
          const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : ''
          const bio = typeof parsed.bio === 'string' ? parsed.bio.trim() : ''

          const existing = submission.user_id ? db.prepare(
            "select id, slug from artists where user_id = ?"
          ).get(submission.user_id) as { id: number; slug: string } | undefined : undefined

          const slug = existing?.slug || uniqueSlug(db, makeSlug(name))

          db.prepare(
            "update submissions set status = 'approved', feedback = ? where id = ?"
          ).run(feedback, id)

          if (existing) {
            db.prepare(
              "update artists set name = ?, slug = ?, bio = ?, status = 'approved', feedback_message = ? where id = ?"
            ).run(name, slug, bio, feedback, existing.id)
          } else if (submission.user_id) {
            db.prepare(
              "insert into artists (user_id, name, slug, bio, avatar_url, status, feedback_message, created_at) values (?, ?, ?, ?, '', 'approved', ?, ?)"
            ).run(submission.user_id, name, slug, bio, feedback, now)
          }

          return { ok: true, status: 'approved' }
        }

        set.status = 400
        return { error: 'unexpected status' }
      } catch (err) {
        console.error('admin artists application review failed', err)
        set.status = 500
        return { error: 'failed to review application' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    // ─── Artist Content (moderation) ───
    .get('/content/pending', ({ set }) => {
      try {
        const rows = db.prepare(
          "select s.id, s.user_id, s.artist_id, s.type, s.status, s.data, s.feedback, s.created_at, a.name as artist_name from submissions s left join artists a on a.id = s.artist_id where s.type != 'artist_registration' and s.status = 'pending' order by s.created_at desc"
        ).all() as Array<{ id: number; user_id: number; artist_id: number | null; type: string; status: string; data: string; feedback: string; created_at: number; artist_name: string | null }>

        const items = rows.map((r) => {
          let parsed: Record<string, unknown> = {}
          try { parsed = JSON.parse(r.data) } catch { /* invalid JSON — keep default */ }
          return {
            id: r.id,
            artistId: r.artist_id || 0,
            artistName: r.artist_name || '',
            title: typeof parsed.title === 'string' ? parsed.title : '',
            description: typeof parsed.description === 'string' ? parsed.description : '',
            fileUrl: typeof parsed.fileUrl === 'string' ? parsed.fileUrl : '',
            thumbnailUrl: typeof parsed.thumbnailUrl === 'string' ? parsed.thumbnailUrl : '',
            type: r.type,
            status: r.status,
            feedback: r.feedback,
            createdAt: r.created_at,
          }
        })

        return { ok: true, items }
      } catch (err) {
        console.error('admin artists content list failed', err)
        set.status = 500
        return { error: 'failed to list content' }
      }
    }, { beforeHandle: requireAdmin })
    .put('/content/:id/review', ({ params, body, set }) => {
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

        const row = db.prepare(
          "select id, type from submissions where id = ? and type != 'artist_registration'"
        ).get(id) as { id: number; type: string } | undefined

        if (!row) {
          set.status = 404
          return { error: 'submission not found' }
        }

        db.prepare(
          "update submissions set status = ?, feedback = ? where id = ?"
        ).run(status, feedback, id)

        return { ok: true, status }
      } catch (err) {
        console.error('admin artists content review failed', err)
        set.status = 500
        return { error: 'failed to review content' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .put('/:id/verify', ({ params, body, set }) => {
      try {
        const id = Number(params.id)
        if (!Number.isFinite(id)) {
          set.status = 400
          return { error: 'invalid id' }
        }

        const b = (body || {}) as Record<string, unknown>
        const verified = b.verified === true ? 1 : 0
        if (verified) {
          db.prepare("update artists set verified = 1, status = 'approved' where id = ?").run(id)
        } else {
          db.prepare("update artists set verified = 0 where id = ?").run(id)
        }
        return { ok: true, verified: Boolean(verified) }
      } catch (err) {
        console.error('admin artists verify failed', err)
        set.status = 500
        return { error: 'failed to update artist verification' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
