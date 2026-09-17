import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { createSessionPlugin } from '../../middleware/session.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { getOptionalEnv } from '../../lib/config.js'
import type { ReleaseDownloadService } from '../../lib/release-download-service.js'
import { createAdminAuthRouter } from './auth.js'
import { createAdminOrdersRouter } from './orders.js'
import { createAdminReleasesRouter } from './releases.js'
import { createAdminShopRouter } from './shop.js'
import { createAdminGalleryRouter } from './gallery.js'
import { createAdminVideoRouter } from './video.js'
import { createAdminRadioRouter } from './radio.js'
import { createAdminSiteConfigRouter, getFeatureFlags } from './site-config.js'
import { createAdminBannersRouter } from './banners.js'
import { createAdminUsersRouter } from './users.js'
import { createAdminContentRouter } from './content.js'
import { createAdminCommentsRouter } from './comments.js'
import { createAdminSubmissionsRouter } from './submissions.js'
import { createAdminSupportRouter } from './support.js'
import { createAdminArtistsRouter } from './artists.js'

export function createAdminRouter({ db, manifestPath, releaseService, contentRoot }: { db: DatabaseSync; manifestPath: string; releaseService: ReleaseDownloadService; contentRoot: string }) {
  return new Elysia()
    .use(createSessionPlugin({ db }))
    .use(createAdminAuthRouter({ db }))
    .use(createAdminOrdersRouter({ db }))
    .use(createAdminReleasesRouter({ db, releaseService }))
    .use(createAdminShopRouter({ db }))
    .use(createAdminGalleryRouter())
    .use(createAdminVideoRouter())
    .use(createAdminRadioRouter({ manifestPath }))
    .use(createAdminSiteConfigRouter({ db }))
    .use(createAdminBannersRouter({ db }))
    .use(createAdminUsersRouter({ db }))
    .use(createAdminContentRouter({ contentRoot }))
    .use(createAdminCommentsRouter({ db }))
    .use(createAdminSubmissionsRouter({ db }))
    .use(createAdminSupportRouter({ db }))
    .use(createAdminArtistsRouter({ db }))
    .get('/api/admin/config', () => {
      const features = getFeatureFlags(db)
      return {
        ok: true,
        features: { ...features, trackingAutoUpdate: Boolean(getOptionalEnv('CDEK_CLIENT_ID', '') || getOptionalEnv('RUSSIAN_POST_TOKEN', '')) }
      }
    }, { beforeHandle: requireAdmin })
}
