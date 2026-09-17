import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import {
  getUserLike, getSessionLike, insertLike, deleteLike,
  getUserLikedTracks, getSessionLikedTracks, getTrackLikesCount,
  socialMetricsHidden, resolveUserAndSession,
} from '../../lib/social-helpers.js'
import { createSessionPlugin } from '../../middleware/session.js'

export function createLikesRouter({ db }: { db: DatabaseSync }) {
  return new Elysia()
    .use(createSessionPlugin({ db }))

    .post('/likes/toggle', async ({ body, request, set, user }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const targetType = b.targetType as string
        const targetSlug = b.targetSlug as string
        const trackIndex = b.trackIndex
        if (!targetType || !['album', 'track'].includes(targetType)) {
          set.status = 400
          return { error: 'Invalid targetType' }
        }
        if (!targetSlug || typeof targetSlug !== 'string') {
          set.status = 400
          return { error: 'Invalid targetSlug' }
        }
        const tIdx = targetType === 'track' ? (typeof trackIndex === 'number' ? trackIndex : null) : null
        if (targetType === 'track' && tIdx === null) {
          set.status = 400
          return { error: 'trackIndex required for track likes' }
        }

        if (user) {
          const existing = await getUserLike(db, user.id, targetType, targetSlug, tIdx)
          if (existing) {
            deleteLike(db, existing.id)
            return { liked: false }
          }
          insertLike(db, user.id, '', targetType, targetSlug, tIdx)
          return { liked: true }
        }

        const { sessionId } = resolveUserAndSession({ request, set, user })

        const existing = await getSessionLike(db, sessionId, targetType, targetSlug, tIdx)
        if (existing) {
          deleteLike(db, existing.id)
          return { liked: false }
        }
        insertLike(db, null, sessionId, targetType, targetSlug, tIdx)
        return { liked: true }
      } catch (err) {
        console.error('like toggle failed', err)
        set.status = 500
        return { error: 'Like toggle failed' }
      }
    })

    .get('/likes/:slug', async ({ params, request, set, user }) => {
      try {
        const slug = params.slug
        if (!slug) {
          set.status = 400
          return { error: 'Invalid slug' }
        }

        const hidden = await socialMetricsHidden(slug)
        const { albumLikes, trackLikes } = getTrackLikesCount(db, slug)

        let userAlbumLiked = false
        const userTrackLiked: number[] = []

        if (user) {
          const alb = await getUserLike(db, user.id, 'album', slug, null)
          userAlbumLiked = !!alb
          const tks = await getUserLikedTracks(db, user.id, slug)
          userTrackLiked.push(...tks)
        } else {
          const sessionId = getCookieLikesSid(request)
          if (sessionId) {
            const alb = await getSessionLike(db, sessionId, 'album', slug, null)
            userAlbumLiked = !!alb
            const tks = await getSessionLikedTracks(db, sessionId, slug)
            userTrackLiked.push(...tks)
          }
        }

        return { ok: true, hidden, albumLikes, trackLikes, userAlbumLiked, userTrackLiked }
      } catch (err) {
        console.error('get likes failed', err)
        set.status = 500
        return { error: 'Failed to get likes' }
      }
    })

    .post('/video-likes/toggle', async ({ body, request, set, user }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const targetSlug = b.targetSlug
        if (!targetSlug || typeof targetSlug !== 'string') {
          set.status = 400
          return { error: 'Invalid targetSlug' }
        }

        if (user) {
          const existing = await getUserLike(db, user.id, 'video', targetSlug, null)
          if (existing) {
            deleteLike(db, existing.id)
            return { liked: false }
          }
          insertLike(db, user.id, '', 'video', targetSlug, null)
          return { liked: true }
        }

        const { sessionId } = resolveUserAndSession({ request, set, user })

        const existing = await getSessionLike(db, sessionId, 'video', targetSlug, null)
        if (existing) {
          deleteLike(db, existing.id)
          return { liked: false }
        }
        insertLike(db, null, sessionId, 'video', targetSlug, null)
        return { liked: true }
      } catch (err) {
        console.error('video like toggle failed', err)
        set.status = 500
        return { error: 'Video like toggle failed' }
      }
    })
}

function getCookieLikesSid(request: Request): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === 'likes_sid') return part.slice(idx + 1).trim() || undefined
  }
  return undefined
}
