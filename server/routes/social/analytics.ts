import { Elysia } from 'elysia'
import type { DatabaseSync, SQLInputValue } from '../../lib/sqlite.js'
import { buildTimeRange, clampPagination } from '../../lib/analytics.js'
import { buildWhereClause, toggleSocialMetricsHidden } from '../../lib/social-helpers.js'
import { createSessionPlugin } from '../../middleware/session.js'

export function createAnalyticsRouter({ db }: { db: DatabaseSync }) {
  return new Elysia()
    .use(createSessionPlugin({ db }))

    .get('/analytics/plays', ({ query, set, isAdmin }) => {
      try {
        if (!isAdmin) {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const range = (typeof query.range === 'string' && query.range) || 'all'
        const slug = typeof query.slug === 'string' ? query.slug : undefined
        const sortBy = (typeof query.sortBy === 'string' && query.sortBy) || 'created_at'
        const sortOrder = (typeof query.sortOrder === 'string' && query.sortOrder) || 'desc'
        const search = typeof query.search === 'string' ? query.search : undefined
        const { offset, limit } = clampPagination(typeof query.offset === 'string' ? query.offset : undefined, typeof query.limit === 'string' ? query.limit : undefined)

        const rangeFrom = buildTimeRange(range)

        const { where, params } = buildWhereClause({
          'p.created_at__gte': rangeFrom > 0 ? rangeFrom : undefined,
          'p.release_slug': slug,
          'p.release_slug__like': search ? `%${search}%` : undefined,
        })

        const allowedSorts: Record<string, string> = { created_at: 'p.created_at', track_index: 'p.track_index', category: 'p.category', release_slug: 'p.release_slug' }
        const orderCol = allowedSorts[sortBy] || 'p.created_at'
        const order = sortOrder === 'asc' ? 'ASC' : 'DESC'

        const countRow = db.prepare(`SELECT COUNT(*) as count FROM plays p ${where}`).get(...(params as SQLInputValue[])) as { count: number }
        const rows = db.prepare(`SELECT p.* FROM plays p ${where} ORDER BY ${orderCol} ${order} LIMIT ? OFFSET ?`).all(...(params as SQLInputValue[]), limit, offset)

        const summary = db.prepare(`
          SELECT p.release_slug, COUNT(*) as total_plays,
                 SUM(CASE WHEN p.category = 'full' THEN 1 ELSE 0 END) as full_plays,
                 SUM(CASE WHEN p.category = 'partial' THEN 1 ELSE 0 END) as partial_plays,
                 SUM(CASE WHEN p.category = 'skip' THEN 1 ELSE 0 END) as skip_plays,
                 COUNT(DISTINCT p.track_index) as tracks_played
          FROM plays p ${where} GROUP BY p.release_slug ORDER BY total_plays DESC
        `).all(...(params as SQLInputValue[]))

        return { ok: true, rows, summary, total: countRow.count }
      } catch (err) {
        console.error('analytics plays failed', err)
        set.status = 500
        return { error: 'Failed to get analytics' }
      }
    })

    .get('/analytics/likes', ({ query, set, isAdmin }) => {
      try {
        if (!isAdmin) {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const range = (typeof query.range === 'string' && query.range) || 'all'
        const slug = typeof query.slug === 'string' ? query.slug : undefined
        const sortBy = (typeof query.sortBy === 'string' && query.sortBy) || 'created_at'
        const sortOrder = (typeof query.sortOrder === 'string' && query.sortOrder) || 'desc'
        const search = typeof query.search === 'string' ? query.search : undefined
        const { offset, limit } = clampPagination(typeof query.offset === 'string' ? query.offset : undefined, typeof query.limit === 'string' ? query.limit : undefined)

        const rangeFrom = buildTimeRange(range)

        const { where, params } = buildWhereClause({
          'l.created_at__gte': rangeFrom > 0 ? rangeFrom : undefined,
          'l.target_slug': slug,
          'l.target_slug__like': search ? `%${search}%` : undefined,
        })

        const allowedSorts: Record<string, string> = { created_at: 'l.created_at', target_slug: 'l.target_slug', target_type: 'l.target_type' }
        const orderCol = allowedSorts[sortBy] || 'l.created_at'
        const order = sortOrder === 'asc' ? 'ASC' : 'DESC'

        const countRow = db.prepare(`SELECT COUNT(*) as count FROM likes l ${where}`).get(...(params as SQLInputValue[])) as { count: number }
        const rows = db.prepare(`SELECT l.* FROM likes l ${where} ORDER BY ${orderCol} ${order} LIMIT ? OFFSET ?`).all(...(params as SQLInputValue[]), limit, offset)

        const summary = db.prepare(`
          SELECT l.target_slug, COUNT(*) as total_likes,
                 SUM(CASE WHEN l.target_type = 'album' THEN 1 ELSE 0 END) as album_likes,
                 SUM(CASE WHEN l.target_type = 'track' THEN 1 ELSE 0 END) as track_likes
          FROM likes l ${where} GROUP BY l.target_slug ORDER BY total_likes DESC
        `).all(...(params as SQLInputValue[]))

        return { ok: true, rows, summary, total: countRow.count }
      } catch (err) {
        console.error('analytics likes failed', err)
        set.status = 500
        return { error: 'Failed to get analytics' }
      }
    })

    .get('/analytics/video-views', ({ query, set, isAdmin }) => {
      try {
        if (!isAdmin) {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const range = (typeof query.range === 'string' && query.range) || 'all'
        const slug = typeof query.slug === 'string' ? query.slug : undefined
        const { offset, limit } = clampPagination(typeof query.offset === 'string' ? query.offset : undefined, typeof query.limit === 'string' ? query.limit : undefined)

        const rangeFrom = buildTimeRange(range)

        const { where, params } = buildWhereClause({
          'v.created_at__gte': rangeFrom > 0 ? rangeFrom : undefined,
          'v.video_slug': slug,
        })

        const countRow = db.prepare(`SELECT COUNT(*) as count FROM video_views v ${where}`).get(...(params as SQLInputValue[])) as { count: number }
        const rows = db.prepare(`SELECT v.* FROM video_views v ${where} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`).all(...(params as SQLInputValue[]), limit, offset)

        const summary = db.prepare(`
          SELECT v.video_slug, COUNT(*) as total_views,
                 SUM(v.completed) as completed_views,
                 AVG(v.duration_watched) as avg_duration
          FROM video_views v ${where} GROUP BY v.video_slug ORDER BY total_views DESC
        `).all(...(params as SQLInputValue[]))

        const likesParams: (string | number)[] = []
        if (slug) likesParams.push(slug)
        const likesSummary = db.prepare(`
          SELECT l.target_slug, COUNT(*) as total_likes
          FROM likes l WHERE l.target_type = 'video' ${slug ? 'AND l.target_slug = ?' : ''}
          GROUP BY l.target_slug ORDER BY total_likes DESC
        `).all(...likesParams)

        return { ok: true, rows, summary, likesSummary, total: countRow.count }
      } catch (err) {
        console.error('video analytics failed', err)
        set.status = 500
        return { error: 'Failed to get video analytics' }
      }
    })

    .patch('/admin/metrics/:slug', async ({ params, body, set, isAdmin }) => {
      try {
        if (!isAdmin) {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const slug = params.slug
        if (!slug) {
          set.status = 400
          return { error: 'Invalid slug' }
        }

        const b = (body || {}) as Record<string, unknown>
        const hidden = b.hidden === true
        const success = await toggleSocialMetricsHidden(slug, hidden)
        if (!success) {
          set.status = 404
          return { error: 'Release not found' }
        }

        return { ok: true, hidden }
      } catch (err) {
        console.error('toggle social metrics failed', err)
        set.status = 500
        return { error: 'Failed to toggle social metrics' }
      }
    })
}
