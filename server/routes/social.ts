import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { createLikesRouter } from './social/likes.js'
import { createPlaysRouter } from './social/plays.js'
import { createVideoViewsRouter } from './social/video-views.js'
import { createAnalyticsRouter } from './social/analytics.js'

export function createSocialRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/social' })
    .use(createLikesRouter({ db }))
    .use(createPlaysRouter({ db }))
    .use(createVideoViewsRouter({ db }))
    .use(createAnalyticsRouter({ db }))
}
