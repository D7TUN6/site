import crypto from 'node:crypto'
import { requestBodyStream } from '../../lib/http-body.js'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import busboy from 'busboy'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import {
  SHOP_ROOT, SHOP_IMG_EXT, SHOP_CONVERT_EXTS, shopSlugify,
  normalizeParam, readProductJson, writeProductJson,
  regenerateShopManifestLite, processShopImage, removeShopImageFiles,
} from './shared.js'

export function createAdminShopRouter({ db: _db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/shop' })
    .get('/', async ({ set }) => {
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
        return { ok: true, products }
      } catch (err) {
        console.error('admin shop list failed', err)
        set.status = 500
        return { error: 'Unable to list products' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/', async ({ body, set }) => {
      const b = (body || {}) as Record<string, unknown>
      const title = typeof b.title === 'string' ? b.title.trim() : ''
      if (!title) {
        set.status = 400
        return { error: 'title is required' }
      }
      const slug = shopSlugify(title)
      if (!slug) {
        set.status = 400
        return { error: 'Invalid title' }
      }
      if (await readProductJson(slug)) {
        set.status = 409
        return { error: 'Product with this slug already exists' }
      }
      const data = { slug, title, category: typeof b.category === 'string' ? b.category.trim() : '', artistSlug: typeof b.artistSlug === 'string' ? b.artistSlug.trim() : '', price: Math.floor(Number(b.price) || 0), status: ['available', 'sold_out', 'coming_soon'].includes(b.status as string) ? b.status as string : 'available', quantity: Math.max(0, Math.floor(Number(b.quantity) || 0)), images: [] as string[], coverImage: null as string | null, description: { en: typeof b.descriptionEn === 'string' ? b.descriptionEn : '', ru: typeof b.descriptionRu === 'string' ? b.descriptionRu : '' } }
      try {
        await writeProductJson(slug, data)
        await mkdir(path.join(SHOP_ROOT, slug, 'images'), { recursive: true })
        await regenerateShopManifestLite()
        return { ok: true, slug }
      } catch (err) {
        console.error('admin shop create failed', err)
        set.status = 500
        return { error: 'Unable to create product' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .patch('/:slug', async ({ params, body, set }) => {
      const slug = normalizeParam(params.slug, /[^a-z0-9-]/g)
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const data = await readProductJson(slug)
      if (!data) {
        set.status = 404
        return { error: 'Product not found' }
      }

      const b = (body || {}) as Record<string, unknown>
      if (typeof b.title === 'string') data.title = b.title.trim()
      if (typeof b.category === 'string') data.category = b.category.trim()
      if (typeof b.artistSlug === 'string') data.artistSlug = b.artistSlug.trim()
      if (b.price !== undefined) data.price = Math.floor(Number(b.price) || 0)
      if (['available', 'sold_out', 'coming_soon'].includes(b.status as string)) data.status = b.status as string
      if (b.quantity !== undefined) data.quantity = Math.max(0, Math.floor(Number(b.quantity) || 0))
      if (typeof b.descriptionEn === 'string') data.description = { ...data.description, en: b.descriptionEn }
      if (typeof b.descriptionRu === 'string') data.description = { ...data.description, ru: b.descriptionRu }
      if (typeof b.coverImage === 'string') {
        const imgs = Array.isArray(data.images) ? data.images : []
        data.coverImage = imgs.includes(b.coverImage) ? b.coverImage : (imgs[0] ?? null)
      }
      if (Array.isArray(b.images)) {
        const existing = new Set(Array.isArray(data.images) ? data.images : [])
        data.images = b.images.filter((f: unknown) => typeof f === 'string' && existing.has(f))
      }

      try {
        await writeProductJson(slug, data)
        await regenerateShopManifestLite()
        return { ok: true }
      } catch (err) {
        console.error('admin shop patch failed', err)
        set.status = 500
        return { error: 'Unable to update product' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:slug', async ({ params, set }) => {
      const slug = normalizeParam(params.slug, /[^a-z0-9-]/g)
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      try {
        const targetDir = path.resolve(SHOP_ROOT, slug)
        if (!targetDir.startsWith(SHOP_ROOT + path.sep)) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        await rm(targetDir, { recursive: true, force: true })
        await regenerateShopManifestLite()
        return { ok: true }
      } catch (err) {
        console.error('admin shop delete failed', err)
        set.status = 500
        return { error: 'Unable to delete product' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/:slug/images/reorder', async ({ params, body, set }) => {
      const slug = normalizeParam(params.slug, /[^a-z0-9-]/g)
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const data = await readProductJson(slug)
      if (!data) {
        set.status = 404
        return { error: 'Product not found' }
      }

      const b = (body || {}) as Record<string, unknown>
      const order = Array.isArray(b.order) ? b.order as string[] : []
      if (order.length === 0) {
        set.status = 400
        return { error: 'Order array required' }
      }
      const existing = new Set(Array.isArray(data.images) ? data.images : [])
      data.images = order.filter((f: string) => existing.has(f))
      if (data.coverImage && !data.images.includes(data.coverImage)) data.coverImage = data.images[0] ?? null
      try {
        await writeProductJson(slug, data)
        await regenerateShopManifestLite()
        return { ok: true }
      } catch (err) {
        console.error('admin shop image reorder failed', err)
        set.status = 500
        return { error: 'Unable to reorder images' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/:slug/images', ({ request, params, set }) => {
      return (async () => {
        const slug = normalizeParam(params.slug, /[^a-z0-9-]/g)
        if (!slug) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        const data = await readProductJson(slug)
        if (!data) {
          set.status = 404
          return { error: 'Product not found' }
        }

        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('multipart/form-data')) {
          set.status = 400
          return { error: 'Expected multipart/form-data' }
        }

        const imagesDir = path.join(SHOP_ROOT, slug, 'images')
        await mkdir(imagesDir, { recursive: true })

        const saved: string[] = []
        try {
          await new Promise<void>((resolve, reject) => {
            const bb = busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { fileSize: 30 * 1024 * 1024, files: 20 } })
            const pending: Promise<void>[] = []
            bb.on('file', (_field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
              const ext = path.extname(info.filename).toLowerCase()
              if (!SHOP_IMG_EXT.has(ext)) { stream.resume(); return }
              const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`
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
            requestBodyStream(request.body).pipe(bb)
          })

          const processed: string[] = []
          for (const file of saved) {
            const ext = path.extname(file).toLowerCase()
            if (SHOP_CONVERT_EXTS.has(ext)) {
              const src = path.join(imagesDir, file)
              const { webp } = await processShopImage(src, imagesDir)
              processed.push(webp)
            } else {
              const src = path.join(imagesDir, file)
              const { webp } = await processShopImage(src, imagesDir)
              if (ext !== '.webp') await rm(src, { force: true })
              processed.push(webp)
            }
          }

          data.images = [...(Array.isArray(data.images) ? data.images : []), ...processed]
          if (!data.coverImage && data.images.length > 0) data.coverImage = data.images[0]
          await writeProductJson(slug, data)
          await regenerateShopManifestLite()
          return { ok: true, files: processed }
        } catch (err) {
          console.error('admin shop image upload failed', err)
          set.status = 500
          return { error: 'Unable to upload images' }
        }
      })()
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:slug/images/:filename', async ({ params, set }) => {
      const slug = normalizeParam(params.slug, /[^a-z0-9-]/g)
      const filename = normalizeParam(params.filename, /[^a-z0-9._-]/gi)
      if (!slug || !filename) {
        set.status = 400
        return { error: 'Invalid params' }
      }
      const data = await readProductJson(slug)
      if (!data) {
        set.status = 404
        return { error: 'Product not found' }
      }

      try {
        const imagesDir = path.resolve(SHOP_ROOT, slug, 'images')
        if (!imagesDir.startsWith(SHOP_ROOT + path.sep)) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        const targetFile = path.resolve(imagesDir, filename)
        if (!targetFile.startsWith(imagesDir + path.sep)) {
          set.status = 400
          return { error: 'Invalid filename' }
        }
        await removeShopImageFiles(imagesDir, filename)
        data.images = (Array.isArray(data.images) ? data.images : []).filter((f: string) => f !== filename)
        if (data.coverImage === filename) data.coverImage = data.images[0] ?? null
        await writeProductJson(slug, data)
        await regenerateShopManifestLite()
        return { ok: true }
      } catch (err) {
        console.error('admin shop image delete failed', err)
        set.status = 500
        return { error: 'Unable to delete image' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
