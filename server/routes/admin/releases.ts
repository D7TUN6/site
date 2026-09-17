import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import type { ReleaseDownloadService } from '../../lib/release-download-service.js'
import { createReleasesCrudRouter } from './releases-crud.js'
import { createReleasesMediaRouter } from './releases-media.js'
import { createReleasesTracksRouter, cleanupTempFiles } from './releases-tracks.js'
import { MUSIC_ROOT } from './releases-validation.js'

export function createAdminReleasesRouter({ db, releaseService }: { db: DatabaseSync; releaseService: ReleaseDownloadService }) {
  // Startup cleanup: recover tmp files left from previous failed reorders
  cleanupTempFiles(MUSIC_ROOT).catch(() => {})

  return new Elysia({ prefix: '/api/admin/releases' })
    .use(createReleasesCrudRouter({ db, releaseService }))
    .use(createReleasesMediaRouter({ releaseService }))
    .use(createReleasesTracksRouter({ releaseService }))
}
