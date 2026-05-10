import crypto from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import busboy from 'busboy'
import express from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { getOptionalEnv, requireEnv } from '../lib/config.js'
import { getCookie } from '../lib/cookies.js'
import { ADMIN_SESSION_COOKIE, clearAdminSessionCookie, createAdminSession, revokeAdminSession, setAdminSessionCookie } from '../lib/sessions.js'
import { requireAdmin } from '../middleware/require-auth.js'

const ROOT = process.cwd()
const SHOP_IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])
const SHOP_ROOT = path.join(ROOT, 'public', 'media', 'shop')

function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-') }
function normalizeEmail(raw: unknown) { return typeof raw === 'string' ? raw.trim().toLowerCase() : '' }
function safeEqual(a: string, b: string) { const A = Buffer.from(String(a)); const B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B) }
function shopSlugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-') }
function normalizeParam(value: string | string[] | undefined, pattern: RegExp): string {
  if (typeof value !== 'string') return ''
  return value.replace(pattern, '')
}


function nowMs() { return Date.now() }
function safeParseJson(text: unknown) { if (typeof text !== 'string' || !text) return null; try { return JSON.parse(text) } catch { return null } }
function safeJsonStringify(value: unknown, maxLen = 8000) { const t = JSON.stringify(value ?? null); if (t.length > maxLen) throw new Error('Payload too large'); return t }
function normalizeStatus(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'pending_payment' || value === 'paid' || value === 'shipped' || value === 'delivered' || value === 'canceled' || value === 'new') return value
  return null
}

async function regenerateShopManifestLite() {
  const manifestPath = path.join(ROOT, 'src', 'generated', 'shop-manifest.json')
  const products: unknown[] = []
  let dirents: Array<{ isDirectory: () => boolean; name: string }> = []
  try { dirents = await readdir(SHOP_ROOT, { withFileTypes: true }) as Array<{ isDirectory: () => boolean; name: string }> } catch (error) { void error }
  for (const d of dirents) {
    if (!d.isDirectory()) continue
    try {
      const data = JSON.parse(await readFile(path.join(SHOP_ROOT, d.name, 'product.json'), 'utf-8'))
      const images = Array.isArray(data.images) ? data.images : []
      const coverImage = typeof data.coverImage === 'string' && data.coverImage ? data.coverImage : images[0] ?? null
      products.push({
        slug: d.name,
        title: String(data.title || ''),
        category: String(data.category || ''),
        price: { currency: 'RUB', value: Math.floor(Number(data.price || 0) / 100) },
        unitAmount: Math.floor(Number(data.price || 0)),
        status: String(data.status || 'available'),
        quantity: Number.isFinite(data.quantity) ? Math.max(0, Math.floor(data.quantity)) : 0,
        images: images.map((f: string) => `/media/shop/${d.name}/images/${f}`),
        coverUrl: coverImage ? `/media/shop/${d.name}/images/${coverImage}` : null,
        coverPreviewUrl: coverImage ? `/media/shop/${d.name}/images/${coverImage}` : null,
        descriptionMarkdown: String(data.description?.ru || data.description?.en || ''),
        description: { en: String(data.description?.en || ''), ru: String(data.description?.ru || '') }
      })
    } catch (error) {
      void error
    }
  }
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, JSON.stringify({ products }, null, 2), 'utf-8')
}

async function readProductJson(slug: string) {
  try { return JSON.parse(await readFile(path.join(SHOP_ROOT, slug, 'product.json'), 'utf-8')) } catch { return null }
}

async function writeProductJson(slug: string, data: unknown) {
  const dir = path.join(SHOP_ROOT, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'product.json'), JSON.stringify(data, null, 2), 'utf-8')
}

export function createAdminRouter({ db }: { db: DatabaseSync }) {
  const router = express.Router()

  router.get('/me', (req, res) => res.status(200).json({
    ok: true,
    isAdmin: Boolean(req.isAdmin),
    email: req.isAdmin ? normalizeEmail(requireEnv('ADMIN_EMAIL')) : null,
  }))

  router.post('/logout', enforceSameOrigin, (req, res) => {
    const token = getCookie(req, ADMIN_SESSION_COOKIE)
    if (token) revokeAdminSession(db, token)
    clearAdminSessionCookie(res)
    return res.status(200).json({ ok: true })
  })

  router.post('/login', enforceSameOrigin, (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const adminEmail = normalizeEmail(requireEnv('ADMIN_EMAIL'))
    const adminPassword = requireEnv('ADMIN_PASSWORD')
    if (!email || !password) return res.status(400).json({ error: 'Invalid credentials' })
    if (!safeEqual(email, adminEmail) || !safeEqual(password, adminPassword)) return res.status(401).json({ error: 'Invalid credentials' })
    const session = createAdminSession(db, { ip: req.ip, userAgent: String(req.get('user-agent') || '') })
    setAdminSessionCookie(res, session.token)
    return res.status(200).json({ ok: true })
  })

  
  router.get('/orders', requireAdmin, (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)))
    const orders = db.prepare(`SELECT id,user_id,user_email,status,currency,items_total,shipping_provider,pickup_point_json,customer_comment,payment_provider,payment_id,payment_status,payment_amount,paid_at,shipping_eta,tracking_number,tracking_status,created_at,updated_at FROM orders ORDER BY created_at DESC LIMIT ?`).all(limit) as any[]
    return res.status(200).json({ ok: true, orders: orders.map((row) => ({
      id: row.id, userId: row.user_id, email: row.user_email, status: row.status, itemsTotalMinor: row.items_total,
      shippingProvider: row.shipping_provider, pickupPoint: safeParseJson(row.pickup_point_json), comment: row.customer_comment,
      payment: { provider: row.payment_provider, id: row.payment_id, status: row.payment_status, amountMinor: row.payment_amount, paidAt: row.paid_at },
      shippingEta: row.shipping_eta, tracking: { number: row.tracking_number, status: row.tracking_status }, createdAt: row.created_at, updatedAt: row.updated_at
    })) })
  })

  router.patch('/orders/:orderId', enforceSameOrigin, requireAdmin, (req, res) => {
    const orderId = typeof req.params.orderId === 'string' ? req.params.orderId : ''
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' })
    const existing = db.prepare('SELECT id FROM orders WHERE id = ? LIMIT 1').get(orderId)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const nextStatus = normalizeStatus(req.body?.status)
    const trackingNumber = typeof req.body?.trackingNumber === 'string' ? req.body.trackingNumber.trim() : null
    const trackingStatus = typeof req.body?.trackingStatus === 'string' ? req.body.trackingStatus.trim() : null
    const shippingEta = typeof req.body?.shippingEta === 'string' ? req.body.shippingEta.trim().slice(0, 120) : null
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 600) : null
    const pickupPoint = req.body?.pickupPoint && typeof req.body.pickupPoint === 'object' ? req.body.pickupPoint : null

    const updates: string[] = []
    const params: Array<string | number | null> = []
    if (nextStatus) { updates.push('status = ?'); params.push(nextStatus) }
    if (trackingNumber != null) { updates.push('tracking_number = ?'); params.push(trackingNumber || null) }
    if (trackingStatus != null) { updates.push('tracking_status = ?'); params.push(trackingStatus || null) }
    if (shippingEta != null) { updates.push('shipping_eta = ?'); params.push(shippingEta || null) }
    if (comment != null) { updates.push('customer_comment = ?'); params.push(comment) }
    if (pickupPoint != null) { updates.push('pickup_point_json = ?'); params.push(safeJsonStringify(pickupPoint)) }
    if (!updates.length) return res.status(400).json({ error: 'No changes' })
    updates.push('updated_at = ?'); params.push(nowMs()); params.push(orderId)

    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    db.prepare('INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)').run(orderId, 'admin_update', 'Admin updated order', safeJsonStringify({ status: nextStatus, trackingNumber, trackingStatus, shippingEta }), nowMs())
    return res.status(200).json({ ok: true })
  })

  router.post('/orders/mock', enforceSameOrigin, requireAdmin, (req, res) => {
    const now = nowMs()
    const adminEmail = normalizeEmail(requireEnv('ADMIN_EMAIL'))
    let user = db.prepare('SELECT id, email FROM users WHERE email = ? LIMIT 1').get(adminEmail) as { id: number; email: string } | undefined
    if (!user) {
      const inserted = db.prepare('INSERT INTO users (email, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, 1, ?, ?)').run(adminEmail, 'admin-mock-user', now, now)
      user = { id: Number(inserted.lastInsertRowid), email: adminEmail }
    }

    const orderId = `ord_mock_${now}_${crypto.randomBytes(3).toString('hex')}`
    const itemSlug = 'mock-item'
    const itemTitle = 'Mock test product'
    const unitPrice = 130000
    const qty = 1
    const total = unitPrice * qty
    const pickupPoint = { provider: 'cdek', id: 'mock-cdek-1', name: 'CDEK mock PVZ', address: 'Nevsky Prospect, Saint Petersburg', lat: 59.9343, lon: 30.3351 }

    db.exec('BEGIN')
    try {
      db.prepare('INSERT INTO orders (id,user_id,user_email,status,currency,items_total,shipping_provider,pickup_point_json,customer_comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(orderId, user.id, user.email, 'new', 'RUB', total, 'cdek', JSON.stringify(pickupPoint), 'Admin mock order', now, now)
      db.prepare('INSERT INTO order_items (order_id,product_slug,product_title,unit_price,quantity) VALUES (?,?,?,?,?)')
        .run(orderId, itemSlug, itemTitle, unitPrice, qty)
      db.prepare('INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(orderId, 'created', 'Mock order created by admin', safeJsonStringify({ status: 'new' }), now)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    return res.status(201).json({ ok: true, orderId })
  })

router.get('/config', requireAdmin, (_req, res) => res.status(200).json({ ok: true, features: { trackingAutoUpdate: Boolean(getOptionalEnv('CDEK_CLIENT_ID', '') || getOptionalEnv('RUSSIAN_POST_TOKEN', '')) } }))

  router.get('/releases', requireAdmin, async (_req, res) => {
    try {
      const MUSIC_ROOT = path.join(ROOT, 'public', 'media', 'music')
      const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')
      let manifestReleases: Array<{ slug: string; tracks?: Array<{ sourceUrl?: string; title?: string }>; coverUrl?: string; releaseDate?: string; releaseType?: string }> = []
      try { const raw = await readFile(MANIFEST_PATH, 'utf-8'); const manifest = JSON.parse(raw) as { releases?: typeof manifestReleases }; manifestReleases = Array.isArray(manifest.releases) ? manifest.releases : [] } catch (error) { void error }
      const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => [])
      const releases = await Promise.all(dirents.filter((d) => d.isDirectory()).map(async (d) => {
        const slug = slugify(d.name)
        const mRelease = manifestReleases.find((r) => r.slug === slug)
        const tracks = mRelease?.tracks?.map((t) => {
          let filename = ''
          if (t.sourceUrl) {
            const tracksPrefix = `/media/music/${d.name}/tracks/`
            filename = t.sourceUrl.startsWith(tracksPrefix) ? t.sourceUrl.slice(tracksPrefix.length) : path.basename(t.sourceUrl)
          }
          return { filename, title: t.title ?? '' }
        }) ?? []
        const notesPath = path.join(MUSIC_ROOT, d.name, 'notes', 'notes')
        let notes = ''
        try { notes = await readFile(notesPath, 'utf-8') } catch (error) { void error }
        return { slug, albumName: d.name, tracks, coverUrl: mRelease?.coverUrl ?? null, notes, releaseDate: mRelease?.releaseDate ?? null, releaseType: mRelease?.releaseType ?? 'album' }
      }))
      return res.status(200).json({ ok: true, releases })
    } catch (err) {
      console.error('admin releases list failed', err)
      return res.status(500).json({ error: 'Unable to list releases' })
    }
  })

  router.patch('/releases/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : ''
    if (!slug) return res.status(400).json({ error: 'Invalid slug' })

    const MUSIC_ROOT = path.join(ROOT, 'public', 'media', 'music')
    const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => [])
    const existing = dirents.find((d) => d.isDirectory() && slugify(d.name) === slug)
    if (!existing) return res.status(404).json({ error: 'Release not found' })

    const albumDir = path.join(MUSIC_ROOT, existing.name)
    const newAlbumName = typeof req.body?.albumName === 'string' ? req.body.albumName.trim() || null : null
    const newNotes = typeof req.body?.notes === 'string' ? req.body.notes : null
    const trackRenames = req.body?.trackRenames && typeof req.body.trackRenames === 'object' ? req.body.trackRenames as Record<string, string> : null
    const trackDeletes = Array.isArray(req.body?.trackDeletes) ? req.body.trackDeletes as string[] : null

    try {
      if (newNotes !== null) {
        const notesDir = path.join(albumDir, 'notes')
        await mkdir(notesDir, { recursive: true })
        await writeFile(path.join(notesDir, 'notes'), newNotes, 'utf-8')
      }

      if (Array.isArray(trackDeletes)) {
        const tracksDir = path.join(albumDir, 'tracks')
        for (const filename of trackDeletes) {
          if (typeof filename !== 'string' || filename.includes('..')) continue
          const p = path.resolve(tracksDir, filename)
          if (!p.startsWith(tracksDir + path.sep) && p !== tracksDir) continue
          await rm(p, { force: true })
        }
      }

      if (trackRenames) {
        const tracksDir = path.join(albumDir, 'tracks')
        for (const [oldName, newName] of Object.entries(trackRenames)) {
          if (oldName.includes('..') || newName.includes('..')) continue
          const oldPath = path.resolve(tracksDir, oldName)
          const newPath = path.resolve(tracksDir, newName)
          if (!oldPath.startsWith(tracksDir + path.sep) || !newPath.startsWith(tracksDir + path.sep)) continue
          await rename(oldPath, newPath).catch(() => {})
        }
      }

      let finalDir = albumDir
      if (newAlbumName && newAlbumName !== existing.name) {
        const newDir = path.join(MUSIC_ROOT, newAlbumName)
        await rename(albumDir, newDir)
        finalDir = newDir
      }

      return res.status(200).json({ ok: true, slug: slugify(path.basename(finalDir)) })
    } catch (err) {
      console.error('admin release patch failed', err)
      return res.status(500).json({ error: 'Unable to update release' })
    }
  })

  router.delete('/releases/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : ''
    if (!slug) return res.status(400).json({ error: 'Invalid slug' })
    const MUSIC_ROOT = path.join(ROOT, 'public', 'media', 'music')
    const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => [])
    const existing = dirents.find((d) => d.isDirectory() && slugify(d.name) === slug)
    if (!existing) return res.status(404).json({ error: 'Release not found' })
    try {
      await rm(path.join(MUSIC_ROOT, existing.name), { recursive: true, force: true })
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('admin release delete failed', err)
      return res.status(500).json({ error: 'Unable to delete release' })
    }
  })

  router.get('/shop', requireAdmin, async (_req, res) => {
    try {
      const dirents = await readdir(SHOP_ROOT, { withFileTypes: true }).catch(() => [])
      const products: unknown[] = []
      for (const d of dirents) {
        if (!d.isDirectory()) continue
        const data = await readProductJson(d.name)
        if (!data) continue
        const images = Array.isArray(data.images) ? data.images : []
        products.push({ slug: d.name, title: data.title || '', category: data.category || '', price: data.price || 0, status: data.status || 'available', quantity: data.quantity ?? 0, images, coverImage: data.coverImage || images[0] || null, description: data.description || { en: '', ru: '' } })
      }
      return res.json({ ok: true, products })
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message })
    }
  })

  router.post('/shop', enforceSameOrigin, requireAdmin, async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    if (!title) return res.status(400).json({ error: 'title is required' })
    const slug = shopSlugify(title)
    if (!slug) return res.status(400).json({ error: 'Invalid title' })
    if (await readProductJson(slug)) return res.status(409).json({ error: 'Product with this slug already exists' })
    const data = { slug, title, category: typeof req.body?.category === 'string' ? req.body.category.trim() : '', price: Math.floor(Number(req.body?.price) || 0), status: ['available', 'sold_out', 'coming_soon'].includes(req.body?.status) ? req.body.status : 'available', quantity: Math.max(0, Math.floor(Number(req.body?.quantity) || 0)), images: [] as string[], coverImage: null as string | null, description: { en: typeof req.body?.descriptionEn === 'string' ? req.body.descriptionEn : '', ru: typeof req.body?.descriptionRu === 'string' ? req.body.descriptionRu : '' } }
    try {
      await writeProductJson(slug, data)
      await mkdir(path.join(SHOP_ROOT, slug, 'images'), { recursive: true })
      await regenerateShopManifestLite()
      return res.json({ ok: true, slug })
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message })
    }
  })

  router.patch('/shop/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
    const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g)
    if (!slug) return res.status(400).json({ error: 'Invalid slug' })
    const data = await readProductJson(slug)
    if (!data) return res.status(404).json({ error: 'Product not found' })

    if (typeof req.body?.title === 'string') data.title = req.body.title.trim()
    if (typeof req.body?.category === 'string') data.category = req.body.category.trim()
    if (req.body?.price !== undefined) data.price = Math.floor(Number(req.body.price) || 0)
    if (['available', 'sold_out', 'coming_soon'].includes(req.body?.status)) data.status = req.body.status
    if (req.body?.quantity !== undefined) data.quantity = Math.max(0, Math.floor(Number(req.body.quantity) || 0))
    if (typeof req.body?.descriptionEn === 'string') data.description = { ...data.description, en: req.body.descriptionEn }
    if (typeof req.body?.descriptionRu === 'string') data.description = { ...data.description, ru: req.body.descriptionRu }
    if (typeof req.body?.coverImage === 'string') {
      const imgs = Array.isArray(data.images) ? data.images : []
      data.coverImage = imgs.includes(req.body.coverImage) ? req.body.coverImage : (imgs[0] ?? null)
    }
    if (Array.isArray(req.body?.images)) {
      const existing = new Set(Array.isArray(data.images) ? data.images : [])
      data.images = req.body.images.filter((f: unknown) => typeof f === 'string' && existing.has(f))
    }

    try {
      await writeProductJson(slug, data)
      await regenerateShopManifestLite()
      return res.json({ ok: true })
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message })
    }
  })

  router.delete('/shop/:slug', enforceSameOrigin, requireAdmin, async (req, res) => {
    const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g)
    if (!slug) return res.status(400).json({ error: 'Invalid slug' })
    try {
      await rm(path.join(SHOP_ROOT, slug), { recursive: true, force: true })
      await regenerateShopManifestLite()
      return res.json({ ok: true })
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message })
    }
  })

  router.post('/shop/:slug/images', enforceSameOrigin, requireAdmin, async (req, res) => {
    const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g)
    if (!slug) return res.status(400).json({ error: 'Invalid slug' })
    const data = await readProductJson(slug)
    if (!data) return res.status(404).json({ error: 'Product not found' })

    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('multipart/form-data')) return res.status(400).json({ error: 'Expected multipart/form-data' })

    const imagesDir = path.join(SHOP_ROOT, slug, 'images')
    await mkdir(imagesDir, { recursive: true })

    const saved: string[] = []
    try {
      await new Promise<void>((resolve, reject) => {
        const bb = busboy({ headers: req.headers, limits: { fileSize: 30 * 1024 * 1024, files: 20 } })
        const pending: Promise<void>[] = []
        bb.on('file', (_field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
          const ext = path.extname(info.filename).toLowerCase()
          if (!SHOP_IMG_EXT.has(ext)) { stream.resume(); return }
          const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
          const dest = path.join(imagesDir, filename)
          const p = new Promise<void>((r, j) => {
            const ws = createWriteStream(dest)
            stream.pipe(ws)
            ws.on('finish', () => { saved.push(filename); r() })
            ws.on('error', j)
            stream.on('error', j)
          })
          pending.push(p)
        })
        bb.on('error', reject)
        bb.on('finish', () => Promise.all(pending).then(() => resolve()).catch(reject))
        req.pipe(bb)
      })

      data.images = [...(Array.isArray(data.images) ? data.images : []), ...saved]
      if (!data.coverImage && data.images.length > 0) data.coverImage = data.images[0]
      await writeProductJson(slug, data)
      await regenerateShopManifestLite()
      return res.json({ ok: true, files: saved })
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message })
    }
  })

  router.delete('/shop/:slug/images/:filename', enforceSameOrigin, requireAdmin, async (req, res) => {
    const slug = normalizeParam(req.params.slug, /[^a-z0-9-]/g)
    const filename = normalizeParam(req.params.filename, /[^a-z0-9._-]/gi)
    if (!slug || !filename) return res.status(400).json({ error: 'Invalid params' })
    const data = await readProductJson(slug)
    if (!data) return res.status(404).json({ error: 'Product not found' })

    try {
      await rm(path.join(SHOP_ROOT, slug, 'images', filename), { force: true })
      data.images = (Array.isArray(data.images) ? data.images : []).filter((f: string) => f !== filename)
      if (data.coverImage === filename) data.coverImage = data.images[0] ?? null
      await writeProductJson(slug, data)
      await regenerateShopManifestLite()
      return res.json({ ok: true })
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message })
    }
  })

  return router
}
