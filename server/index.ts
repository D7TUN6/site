import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import { openAppDb } from './lib/db.js'
import { cleanupExpiredSessions } from './lib/sessions.js'
import { installSessionMiddleware } from './middleware/session.js'
import { ReleaseDownloadService } from './lib/release-download-service.js'
import { createReleaseRouter } from './routes/releases.js'
import { createAuthRouter } from './routes/auth.js'
import { createAdminRouter } from './routes/admin.js'
import { createOrdersRouter } from './routes/orders.js'
import { createOrderHub } from './lib/order-hub.js'
import { createConfigRouter } from './routes/config.js'
import { createShippingRouter } from './routes/shipping.js'
import { createYooKassaRouter } from './routes/payments-yookassa.js'

const ROOT = process.cwd()
const DIST_DIR = path.join(ROOT, 'dist')
const PUBLIC_DIR = path.join(ROOT, 'public')
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

const port = Number(process.env.PORT || 3001)
const host = process.env.HOSTNAME || '127.0.0.1'

const { db } = openAppDb({ rootDir: ROOT })
cleanupExpiredSessions(db)

const app = express()
app.use(cookieParser())
app.use(express.json({ limit: '64kb' }))
app.use(express.urlencoded({ extended: false, limit: '64kb' }))
app.use(installSessionMiddleware({ db }))

const releaseService = new ReleaseDownloadService({ root: ROOT, manifestPath: MANIFEST_PATH })
await releaseService.bootstrap()
const orderHub = createOrderHub()

app.use('/api/releases', createReleaseRouter({ service: releaseService, manifestPath: MANIFEST_PATH }))
app.use('/api/auth', createAuthRouter({ db }))
app.use('/api/admin', createAdminRouter({ db }))
app.use('/api/orders', createOrdersRouter({ db, hub: orderHub }))
app.use('/api/config', createConfigRouter())
app.use('/api/shipping', createShippingRouter())
app.use('/api/payments/yookassa', createYooKassaRouter({ db, hub: orderHub }))
app.use(express.static(PUBLIC_DIR, { index: false }))
app.use(express.static(DIST_DIR, { index: false }))
app.get(/.*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))

app.listen(port, host, () => {
  console.log(`d7tun6-site api listening on http://${host}:${port}`)
})
