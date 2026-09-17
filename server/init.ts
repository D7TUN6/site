import path from 'node:path'
import { readdir, rm } from 'node:fs/promises'
import { openAppDb } from './lib/db.js'
import { cleanupExpiredSessions } from './lib/sessions.js'
import { initConfigDb } from './routes/config.js'
import { initFeatureToggle } from './middleware/feature-toggle.js'
import { initRadio } from './routes/radio.js'
import { initBotAuth } from './lib/bot-auth.js'
import { ReleaseDownloadService } from './lib/release-download-service.js'
import { createOrderHub } from './lib/order-hub.js'
import { loadTimeline } from './lib/radio/timeline.js'
import { radioState, regenerateRadioStream, PLAYLIST_FILE } from './lib/radio/stream-generator.js'
import { exists } from './lib/media-convert.js'
import { publishscheduledsubmissions } from './routes/admin/submissions.js'
import { startJanitor } from './janitor.js'
import { CacheIndex } from './lib/cache-index.js'
import { audioConfig } from './lib/audio-config.js'
import { startBackgroundLoudnessScan } from './lib/loudness-scanner.js'
import type { DatabaseSync } from './lib/sqlite.js'

const ROOT = process.cwd()
const PUBLIC_DIR = path.join(ROOT, 'public')
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

export type AppServices = {
  db: DatabaseSync
  releaseService: ReleaseDownloadService
  orderHub: ReturnType<typeof createOrderHub>
  manifestPath: string
  publicDir: string
  contentRoot: string
}

export async function initializeServices(): Promise<AppServices> {
  // Clean up stale radio temp dirs from previous ffmpeg runs
  try {
    const entries = await readdir(PUBLIC_DIR + '/media')
    await Promise.all(entries
      .filter((e) => e.startsWith('radio.tmp-'))
      .map((e) => rm(path.join(PUBLIC_DIR + '/media', e), { recursive: true, force: true }).catch((err) => console.error('radio temp cleanup failed', err)))
    )
  } catch (err) {
    console.error('readdir media failed', err)
  }

  const { db } = await openAppDb({ rootDir: ROOT })
  try { cleanupExpiredSessions(db) } catch (err) { console.error('cleanupExpiredSessions failed', err) }
  initConfigDb(db)
  initFeatureToggle(db)
  initRadio(MANIFEST_PATH)
  const botAuthKey = process.env.BOT_AUTH_PRIVATE_KEY
  if (botAuthKey) initBotAuth(botAuthKey)

  const releaseService = new ReleaseDownloadService({ root: ROOT, manifestPath: MANIFEST_PATH })
  await releaseService.bootstrap()
  const orderHub = createOrderHub()

  const contentRoot = path.join(ROOT, 'content', 'mdx')

  // load timeline into memory before handling requests
  await loadTimeline()

  // Radio catalog (timeline metadata for now-playing lookups). Regenerate when
// there is no catalog yet, or when a legacy HLS-era catalog lacks the fields
// the live stream flow needs (per-track sourceUrl → titled playlist), or when
// the titled playlist.js liquidsoap fetches is missing. The live broadcast
// itself is handled by Liquidsoap/Icecast — the server no longer encodes audio.
  const first = radioState.currentTimeline[0]
  const needsRegen = radioState.currentTimeline.length === 0
    || !first?.sourceUrl
    || !(await exists(PLAYLIST_FILE))
  if (needsRegen) {
    // A legacy HLS-era catalog is the one case where we must bypass the 6h
    // min-interval guard — it would otherwise block the one-time migration to
    // the new live-stream catalog (per-track sourceUrl + titled playlist).
    console.log(`radio: catalog/playlist needs rebuild (timeline=${radioState.currentTimeline.length}, sourceUrl=${Boolean(first?.sourceUrl)}) — generating in background`)
    regenerateRadioStream(MANIFEST_PATH, { force: true })
      .then(() => loadTimeline())
      .catch((err) => console.error('radio initial generation failed', err))
  }

  // Start cache janitor
  const cacheIndex = new CacheIndex(ROOT)
  await cacheIndex.load()
  startJanitor(cacheIndex, audioConfig.cache)

  // Background loudness analysis: scan tracks without loudness data
  startBackgroundLoudnessScan(db)

  return {
    db,
    releaseService,
    orderHub,
    manifestPath: MANIFEST_PATH,
    publicDir: PUBLIC_DIR,
    contentRoot,
  }
}

export function startPeriodicTasks(db: DatabaseSync) {
  setInterval(() => publishscheduledsubmissions(db), 60_000).unref()
}
