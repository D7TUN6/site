import path from 'node:path'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { openAppDb } from './lib/db.js'
import { cleanupExpiredSessions } from './lib/sessions.js'
import { installSessionMiddleware } from './middleware/session.js'
import { ReleaseDownloadService } from './lib/release-download-service.js'
import { createReleaseRouter } from './routes/releases.js'
import { createAuthRouter } from './routes/auth.js'
import { createAdminRouter } from './routes/admin/index.js'
import { createOrdersRouter } from './routes/orders.js'
import { createOrderHub } from './lib/order-hub.js'
import { createConfigRouter, initConfigDb } from './routes/config.js'
import { createShippingRouter } from './routes/shipping.js'
import { createYooKassaRouter } from './routes/payments-yookassa.js'
import { createGalleryRouter } from './routes/gallery.js'
import { createVideoRouter } from './routes/video.js'
import { createStorageRouter } from './routes/storage.js'
import { createRadioRouter, loadTimeline, isStreamStale, regenerateRadioStream, isSafeToRegenerate } from './routes/radio.js'
import { requireFeature, initFeatureToggle } from './middleware/feature-toggle.js'
import { readdir, rm } from 'node:fs/promises'

const ROOT = process.cwd()
const DIST_DIR = path.join(ROOT, 'dist')
const PUBLIC_DIR = path.join(ROOT, 'public')
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

const port = Number(process.env.WEB_PORT || process.env.PORT || 3001)
const host = process.env.HOSTNAME || '127.0.0.1'

// Clean up stale radio temp dirs from previous ffmpeg runs
readdir(PUBLIC_DIR + '/media').then((entries) => {
  for (const e of entries) {
    if (e.startsWith('radio.tmp-')) rm(path.join(PUBLIC_DIR + '/media', e), { recursive: true, force: true }).catch(() => {})
  }
}).catch(() => {})

const { db } = openAppDb({ rootDir: ROOT })
cleanupExpiredSessions(db)
initConfigDb(db)
initFeatureToggle(db)

const app = express()
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.yookassa.app'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}))
app.use(cookieParser())
app.use(express.json({ limit: '64kb' }))
app.use(express.urlencoded({ extended: false, limit: '64kb' }))
app.use(installSessionMiddleware({ db }))

const releaseService = new ReleaseDownloadService({ root: ROOT, manifestPath: MANIFEST_PATH })
await releaseService.bootstrap()
const orderHub = createOrderHub()

app.use('/api/releases', createReleaseRouter())
app.use('/api/auth', createAuthRouter({ db }))
app.use('/api/admin', createAdminRouter({ db, manifestPath: MANIFEST_PATH }))
app.use('/api/orders', requireFeature('orders'), createOrdersRouter({ db, hub: orderHub }))
app.use('/api/config', createConfigRouter())
app.use('/api/shipping', requireFeature('shop'), createShippingRouter())
app.use('/api/payments/yookassa', requireFeature('shop'), createYooKassaRouter({ db, hub: orderHub }))
app.use('/api/gallery', requireFeature('gallery'), createGalleryRouter())
app.use('/api/video', requireFeature('video'), createVideoRouter())
app.use('/api/storage', createStorageRouter())
app.use('/api/radio', requireFeature('radio'), createRadioRouter({ manifestPath: MANIFEST_PATH }))
const FAR_FUTURE_CACHE = { maxAge: 365 * 24 * 60 * 60 * 1000, immutable: true }
app.use('/media', express.static(PUBLIC_DIR + '/media', { ...FAR_FUTURE_CACHE, index: false }))
app.use('/assets', express.static(DIST_DIR + '/assets', { ...FAR_FUTURE_CACHE, index: false }))
app.use(express.static(PUBLIC_DIR, { index: false }))
app.use(express.static(DIST_DIR, { index: false }))
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: unknown, _req: any, res: any, _next: any) => {
  console.error('Express error:', err)
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal Server Error' })
})
app.get('/{*path}', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))

// load timeline into memory before handling requests
await loadTimeline()

const server = app.listen(port, host, () => {
    console.log(`${process.env.SITE_NAME || process.env.VITE_SITE_TITLE || 'd7tun6-site'} api listening on http://${host}:${port}`)
})

// background regeneration: only if stale and no active listeners
isStreamStale(MANIFEST_PATH).then(async (stale) => {
  if (stale && await isSafeToRegenerate()) {
    console.error('radio stream stale — regenerating in background')
    regenerateRadioStream(MANIFEST_PATH)
      .then(() => loadTimeline())
      .catch((err) => console.error('radio background regeneration failed', err))
  }
}).catch(() => {})


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
