import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import {
  getUserLike, getSessionLike, resolveUserAndSession,
} from '../../lib/social-helpers.js'
import { createSessionPlugin } from '../../middleware/session.js'
import { getRequestIp } from '../../http/util.js'

export function createVideoViewsRouter({ db }: { db: DatabaseSync }) {
  return new Elysia()
    .use(createSessionPlugin({ db }))

    .post('/video-views', ({ body, request, server, set, user }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const videoSlug = b.videoSlug
        const durationWatched = b.durationWatched
        const completed = b.completed
        if (!videoSlug || typeof videoSlug !== 'string') {
          set.status = 400
          return { error: 'Invalid videoSlug' }
        }

        const { userId, sessionId } = resolveUserAndSession({ request, set, user })

        const ip = getRequestIp({ request, server })

        db.prepare('INSERT INTO video_views (video_slug, user_id, session_id, ip, duration_watched, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          videoSlug, userId, sessionId, ip, typeof durationWatched === 'number' ? durationWatched : 0, completed === true ? 1 : 0, Date.now()
        )

        const total = db.prepare('SELECT COUNT(*) as count FROM video_views WHERE video_slug = ?').get(videoSlug) as { count: number }
        return { ok: true, totalViews: total.count }
      } catch (err) {
        console.error('record video view failed', err)
        set.status = 500
        return { error: 'Failed to record video view' }
      }
    })

    .get('/video-stats/:slug', async ({ params, request, set, user }) => {
      try {
        const slug = params.slug
        if (!slug) {
          set.status = 400
          return { error: 'Invalid slug' }
        }

        const totalViewRows = db.prepare('SELECT COUNT(*) as count FROM video_views WHERE video_slug = ?').get(slug) as { count: number }
        const totalViews = totalViewRows.count

        const likesCount = db.prepare('SELECT COUNT(*) as count FROM likes WHERE target_slug = ? AND target_type = ?').get(slug, 'video') as { count: number }

        let userLiked = false
        if (user) {
          userLiked = !!(await getUserLike(db, user.id, 'video', slug, null))
        } else {
          const header = request.headers.get('cookie')
          let sessionId: string | undefined
          if (header) {
            for (const part of header.split(';')) {
              const idx = part.indexOf('=')
              if (idx !== -1 && part.slice(0, idx).trim() === 'likes_sid') sessionId = part.slice(idx + 1).trim() || undefined
            }
          }
          if (sessionId) {
            userLiked = !!(await getSessionLike(db, sessionId, 'video', slug, null))
          }
        }

        return { ok: true, totalViews, totalLikes: likesCount.count, userLiked }
      } catch (err) {
        console.error('get video stats failed', err)
        set.status = 500
        return { error: 'Failed to get video stats' }
      }
    })
}
