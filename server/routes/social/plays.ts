import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import {
  socialMetricsHidden, resolveUserAndSession, getTrackLikesCount,
} from '../../lib/social-helpers.js'
import { createSessionPlugin } from '../../middleware/session.js'
import { getRequestIp } from '../../http/util.js'

export function createPlaysRouter({ db }: { db: DatabaseSync }) {
  return new Elysia()
    .use(createSessionPlugin({ db }))

    .post('/plays', ({ body, request, server, set, user }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const releaseSlug = b.releaseSlug
        const trackIndex = b.trackIndex
        const category = b.category
        if (!releaseSlug || typeof releaseSlug !== 'string') {
          set.status = 400
          return { error: 'Invalid releaseSlug' }
        }
        if (typeof trackIndex !== 'number') {
          set.status = 400
          return { error: 'Invalid trackIndex' }
        }
        if (!['skip', 'partial', 'full'].includes(category as string)) {
          set.status = 400
          return { error: 'Invalid category' }
        }
        const categoryStr = category as string

        const { userId, sessionId } = resolveUserAndSession({ request, set, user })

        const ip = getRequestIp({ request, server })

        db.prepare('INSERT INTO plays (release_slug, track_index, category, user_id, session_id, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          releaseSlug as string, trackIndex as number, categoryStr, userId, sessionId, ip, Date.now()
        )

        return { ok: true }
      } catch (err) {
        console.error('record play failed', err)
        set.status = 500
        return { error: 'Failed to record play' }
      }
    })

    .get('/metrics/:slug', async ({ params, set }) => {
      try {
        const slug = params.slug
        if (!slug) {
          set.status = 400
          return { error: 'Invalid slug' }
        }

        const hidden = await socialMetricsHidden(slug)

        const totalPlays = db.prepare('SELECT category, COUNT(*) as count FROM plays WHERE release_slug = ? GROUP BY category').all(slug) as Array<{ category: string; count: number }>
        const plays: Record<string, number> = { skip: 0, partial: 0, full: 0 }
        for (const row of totalPlays) plays[row.category] = row.count

        const trackPlays = db.prepare('SELECT track_index, category, COUNT(*) as count FROM plays WHERE release_slug = ? GROUP BY track_index, category').all(slug) as Array<{ track_index: number; category: string; count: number }>

        const { albumLikes, trackLikes } = getTrackLikesCount(db, slug)

        return {
          ok: true, hidden,
          plays: { total: Object.values(plays).reduce((a, b) => a + b, 0), ...plays },
          trackPlays, albumLikes, trackLikes,
        }
      } catch (err) {
        console.error('get metrics failed', err)
        set.status = 500
        return { error: 'Failed to get metrics' }
      }
    })
}
