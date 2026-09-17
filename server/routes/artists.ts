import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { requireUser } from '../middleware/require-auth.js'
import { createSessionPlugin } from '../middleware/session.js'

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

const contentTypes: Record<string, string> = {
  music: 'release',
  video: 'media_video',
  image: 'media_photo',
  text: 'release',
}

export function createArtistRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/artists' })
    .use(createSessionPlugin({ db }))

    .get('/', ({ set }) => {
      try {
        const rows = db.prepare(
          "select id, name, slug, avatar_url, bio, verified from artists where status = 'approved' order by name asc"
        ).all() as Array<{ id: number; name: string; slug: string; avatar_url: string; bio: string; verified: number }>
        return { ok: true, artists: rows }
      } catch (err) {
        console.error('artists list failed', err)
        set.status = 500
        return { error: 'failed to list artists' }
      }
    })

    .get('/autocomplete', ({ query }) => {
      try {
        const q = typeof query.q === 'string' ? query.q.trim() : ''
        if (!q || q.length < 2) return { ok: true, artists: [] }
        const pattern = `%${q}%`
        const rows = db.prepare(
          "select id, name, slug, avatar_url, verified from artists where status = 'approved' and (name like ? or slug like ?) limit 20"
        ).all(pattern, pattern) as Array<{ id: number; name: string; slug: string; avatar_url: string; verified: number }>
        return { ok: true, artists: rows }
      } catch (err) {
        console.error('artists autocomplete failed', err)
        return { error: 'search failed' }
      }
    })

    .get('/me', ({ user, set }) => {
      try {
        if (!user) {
          set.status = 401
          return { error: 'unauthorized' }
        }
        const row = db.prepare(
          "select id, name, slug, bio, avatar_url, status, verified from artists where user_id = ?"
        ).get(user.id) as { id: number; name: string; slug: string; bio: string; avatar_url: string; status: string; verified: number } | undefined
        if (!row) return { ok: true, artist: null }
        return { ok: true, artist: row }
      } catch (err) {
        console.error('artists me failed', err)
        set.status = 500
        return { error: 'failed to get artist' }
      }
    }, { beforeHandle: requireUser })

    .post('/apply', ({ body, set, user }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const { name, bio, links } = b
        if (!name || typeof name !== 'string' || !name.trim()) {
          set.status = 400
          return { error: 'name is required' }
        }

        const existing = db.prepare(
          "select id, status from artists where user_id = ?"
        ).get(user!.id) as { id: number; status: string } | undefined

        if (existing && existing.status === 'approved') {
          set.status = 400
          return { error: 'you already have an approved artist profile' }
        }

        const slug = uniqueSlug(db, makeSlug(name))
        const now = Date.now()
        const bioStr = typeof bio === 'string' ? bio.trim() : ''
        const linksStr = typeof links === 'string' ? links.trim() : ''

        if (existing) {
          db.prepare(
            "update artists set name = ?, slug = ?, bio = ?, status = 'pending', feedback_message = '' where id = ?"
          ).run(name.trim(), slug, bioStr, existing.id)
        } else {
          db.prepare(
            "insert into artists (user_id, name, slug, bio, avatar_url, status, feedback_message, created_at) values (?, ?, ?, ?, '', 'pending', '', ?)"
          ).run(user!.id, name.trim(), slug, bioStr, now)
        }

        db.prepare(
          "insert into submissions (user_id, type, status, data, feedback, created_at) values (?, 'artist_registration', 'pending', ?, '', ?)"
        ).run(user!.id, JSON.stringify({ name: name.trim(), bio: bioStr, links: linksStr }), now)

        const artist = db.prepare(
          "select id, name, bio, status, feedback_message as feedback, created_at from artists where user_id = ? order by id desc limit 1"
        ).get(user!.id) as { id: number; name: string; bio: string; status: string; feedback: string; created_at: number }

        set.status = 201
        return {
          ok: true,
          application: {
            id: artist.id,
            userId: user!.id,
            name: artist.name,
            bio: artist.bio,
            links: linksStr,
            status: artist.status,
            feedback: artist.feedback,
            createdAt: artist.created_at,
          },
        }
      } catch (err) {
        console.error('artists apply failed', err)
        set.status = 500
        return { error: 'failed to submit application' }
      }
    }, { beforeHandle: requireUser })

    .get('/application', ({ user }) => {
      try {
        const artist = db.prepare(
          "select id, name, bio, status, feedback_message, created_at from artists where user_id = ?"
        ).get(user!.id) as { id: number; name: string; bio: string; status: string; feedback_message: string; created_at: number } | undefined

        if (!artist) return { ok: true, application: null }

        let status = artist.status
        let feedback = artist.feedback_message
        if (status === 'rejected' && feedback.startsWith('sent_back:')) {
          status = 'sent_back'
          feedback = feedback.slice('sent_back:'.length).trim()
        }

        const submission = db.prepare(
          "select data from submissions where user_id = ? and type = 'artist_registration' order by id desc limit 1"
        ).get(user!.id) as { data: string } | undefined

        let links = ''
        if (submission) {
          try { links = typeof JSON.parse(submission.data).links === 'string' ? JSON.parse(submission.data).links : '' } catch { /* invalid JSON — keep default */ }
        }

        return {
          ok: true,
          application: {
            id: artist.id,
            userId: user!.id,
            name: artist.name,
            bio: artist.bio,
            links,
            status,
            feedback,
            createdAt: artist.created_at,
          },
        }
      } catch (err) {
        console.error('artists application get failed', err)
        return { error: 'failed to get application' }
      }
    }, { beforeHandle: requireUser })

    .get('/content', ({ user }) => {
      try {
        const artist = db.prepare(
          "select id from artists where user_id = ? and status = 'approved'"
        ).get(user!.id) as { id: number } | undefined

        if (!artist) return { ok: true, items: [] }

        const rows = db.prepare(
          "select id, artist_id, type, status, data, feedback, created_at from submissions where user_id = ? and type != 'artist_registration' order by created_at desc"
        ).all(user!.id) as Array<{ id: number; artist_id: number | null; type: string; status: string; data: string; feedback: string; created_at: number }>

        const items = rows.map((r) => {
          let parsed: Record<string, unknown> = {}
          try { parsed = JSON.parse(r.data) } catch { /* invalid JSON — keep default */ }
          return {
            id: r.id,
            artistId: artist.id,
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
        console.error('artists content list failed', err)
        return { error: 'failed to list content' }
      }
    }, { beforeHandle: requireUser })

    .post('/content', ({ body, set, user }) => {
      try {
        const artist = db.prepare(
          "select id from artists where user_id = ? and status = 'approved'"
        ).get(user!.id) as { id: number } | undefined

        if (!artist) {
          set.status = 403
          return { error: 'only approved artists can submit content' }
        }

        const b = (body || {}) as Record<string, unknown>
        const { title, description, type, fileUrl, thumbnailUrl } = b
        if (!title || typeof title !== 'string' || !title.trim()) {
          set.status = 400
          return { error: 'title is required' }
        }

        const rawType = typeof type === 'string' ? type.trim().toLowerCase() : ''
        const finalType = contentTypes[rawType] || 'release'

        const now = Date.now()
        const data = JSON.stringify({
          title: title.trim(),
          description: typeof description === 'string' ? description.trim() : '',
          fileUrl: typeof fileUrl === 'string' ? fileUrl.trim() : '',
          thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '',
          artistId: artist.id,
        })

        const result = db.prepare(
          "insert into submissions (user_id, artist_id, type, status, data, feedback, created_at) values (?, ?, ?, 'pending', ?, '', ?)"
        ).run(user!.id, artist.id, finalType, data)

        set.status = 201
        return {
          ok: true,
          item: {
            id: Number(result.lastInsertRowid),
            artistId: artist.id,
            title: title.trim(),
            description: typeof description === 'string' ? description.trim() : '',
            fileUrl: typeof fileUrl === 'string' ? fileUrl.trim() : '',
            thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '',
            type: finalType,
            status: 'pending',
            feedback: '',
            createdAt: now,
          },
        }
      } catch (err) {
        console.error('artists content submit failed', err)
        set.status = 500
        return { error: 'failed to submit content' }
      }
    }, { beforeHandle: requireUser })

    .get('/:slg', ({ params, set }) => {
      try {
        const row = db.prepare(
          "select id, name, slug, bio, avatar_url, status, verified from artists where slug = ? and status = 'approved'"
        ).get(params.slg) as { id: number; name: string; slug: string; bio: string; avatar_url: string; status: string; verified: number } | undefined
        if (!row) {
          set.status = 404
          return { error: 'not found' }
        }
        return { ok: true, artist: row }
      } catch (err) {
        console.error('artists get failed', err)
        set.status = 500
        return { error: 'failed to get artist' }
      }
    })
}
