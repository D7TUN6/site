import crypto from 'node:crypto'
import { requestBodyStream } from '../../lib/http-body.js'
import { mkdir, readdir, readFile, writeFile, rm, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import busboy from 'busboy'
import { Elysia } from 'elysia'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { ROOT, slugify } from './shared.js'
import { processGalleryImage, spawnRebuild, IMAGE_CONVERT_EXTS } from '../../lib/media-convert.js'
import { getOrder, setOrder, applyOrder } from './order-utils.js'
import { invalidateGalleryCache } from '../../lib/gallery-cache.js'

const GALLERY_ROOT = path.join(ROOT, 'public', 'media', 'gallery')
const GALLERY_IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp'])

async function writeMdx(slug: string, data: { title: string; date: string; tags: string[]; cover: string; images: string[] }) {
  const dir = path.join(GALLERY_ROOT, slug)
  await mkdir(dir, { recursive: true })
  const tagsStr = data.tags.map((t) => `"${t}"`).join(', ')
  const mdx = `---
title: "${data.title.replace(/"/g, '\\"')}"
date: "${data.date}"
tags: [${tagsStr}]
cover: "${data.cover}"
images: [${data.images.map((i) => `"${i}"`).join(', ')}]
---
`
  await writeFile(path.join(dir, 'index.mdx'), mdx, 'utf-8')
}

async function readMdxMeta(entryDir: string, slug: string) {
  const mdx = { title: slug, date: '', tags: [] as string[], cover: '', images: [] as string[] }
  try {
    const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8')
    const titleM = raw.match(/^title:\s*"([^"]*)"/m)
    const dateM = raw.match(/^date:\s*"([^"]*)"/m)
    const tagsM = raw.match(/^tags:\s*\[(.*?)\]/m)
    const imagesM = raw.match(/^images:\s*\[(.*?)\]/m)
    const coverM = raw.match(/^cover:\s*"([^"]*)"/m)
    if (titleM) mdx.title = titleM[1]
    if (dateM) mdx.date = dateM[1]
    if (coverM) mdx.cover = coverM[1]
    if (tagsM) mdx.tags = tagsM[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
    if (imagesM) mdx.images = imagesM[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
  } catch { /* ok */ }
  return mdx
}

export function createAdminGalleryRouter() {
  return new Elysia({ prefix: '/api/admin/gallery' })
    .get('/', async ({ set }) => {
      try {
        const dirents = await readdir(GALLERY_ROOT, { withFileTypes: true }).catch(() => [])
        const entries: unknown[] = []
        for (const d of dirents) {
          if (!d.isDirectory()) continue
          const dir = path.join(GALLERY_ROOT, d.name)
          const mdxMeta = await readMdxMeta(dir, d.name)
          const images = mdxMeta.images
          let cover = mdxMeta.cover
          if (images.length === 0) {
            const imgFiles = await readdir(dir).catch(() => [])
            const seenBases = new Set<string>()
            for (const f of imgFiles) {
              if (f === 'index.mdx') continue
              if (GALLERY_IMG_EXT.has(path.extname(f).toLowerCase()) && !f.includes('-preview.')) {
                const base = path.basename(f, path.extname(f))
                if (seenBases.has(base)) continue
                seenBases.add(base)
                images.push(f)
              }
            }
            if (!cover && images.length > 0) cover = `/media/gallery/${d.name}/${images[0]}`
          }
          if (!cover && images.length > 0) cover = `/media/gallery/${d.name}/${images[0]}`
          entries.push({ slug: d.name, title: mdxMeta.title, date: mdxMeta.date, tags: mdxMeta.tags, images, cover })
        }
        entries.sort((a: unknown, b: unknown) => String((b as Record<string, string>).date).localeCompare(String((a as Record<string, string>).date)))
        const galleryOrder = await getOrder(GALLERY_ROOT)
        return { ok: true, entries: applyOrder(entries as Array<{ slug: string }>, GALLERY_ROOT, galleryOrder) as typeof entries }
      } catch (err) {
        console.error('admin gallery list failed', err)
        set.status = 500
        return { error: 'Unable to list gallery entries' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/', async ({ body, set }) => {
      const b = (body || {}) as Record<string, unknown>
      const title = typeof b.title === 'string' ? b.title.trim() : ''
      if (!title) {
        set.status = 400
        return { error: 'title is required' }
      }
      const slug = slugify(title)
      if (!slug) {
        set.status = 400
        return { error: 'Invalid title' }
      }
      const dir = path.join(GALLERY_ROOT, slug)
      try { await access(dir); set.status = 409; return { error: 'Entry with this slug already exists' } } catch { /* ok */ }

      const date = typeof b.date === 'string' ? b.date.trim() : new Date().toLocaleDateString('en-GB').split('/').reverse().join('-')
      const tags = Array.isArray(b.tags) ? b.tags.map(String) : []

      try {
        await mkdir(dir, { recursive: true })
        await writeMdx(slug, { title, date, tags, cover: '', images: [] })
        await invalidateGalleryCache()
        spawnRebuild()
        return { ok: true, slug }
      } catch (err) {
        console.error('admin gallery create failed', err)
        set.status = 500
        return { error: 'Unable to create gallery entry' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/:slug/images', ({ request, params, set }) => {
      return (async () => {
        const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
        if (!slug) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        const entryDir = path.join(GALLERY_ROOT, slug)
        try { await access(entryDir) } catch {
          set.status = 404
          return { error: 'Entry not found' }
        }

        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('multipart/form-data')) {
          set.status = 400
          return { error: 'Expected multipart/form-data' }
        }

        const imagesDir = entryDir
        const saved: string[] = []
        try {
          await new Promise<void>((resolve, reject) => {
            const bb = busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { fileSize: 50 * 1024 * 1024, files: 100 } })
            const pending: Promise<void>[] = []
            bb.on('file', (_field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
              const ext = path.extname(info.filename).toLowerCase()
              if (!GALLERY_IMG_EXT.has(ext)) { stream.resume(); return }
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
            if (IMAGE_CONVERT_EXTS.has(ext)) {
              const src = path.join(imagesDir, file)
              const result = await processGalleryImage(src, imagesDir)
              processed.push(result.webp)
            } else if (ext === '.webp') {
              const src = path.join(imagesDir, file)
              const result = await processGalleryImage(src, imagesDir)
              processed.push(result.webp)
            } else {
              processed.push(file)
            }
          }

          const mdx = await readMdxMeta(entryDir, slug)

          const imgFiles = await readdir(entryDir)
          const seenBases = new Set<string>()
          const allImages = imgFiles
            .filter((f) => GALLERY_IMG_EXT.has(path.extname(f).toLowerCase()) && !f.includes('-preview.'))
            .filter((f) => {
              const base = path.basename(f, path.extname(f))
              if (seenBases.has(base)) return false
              seenBases.add(base)
              return true
            })

          const existingSet = new Set(mdx.images)
          for (const f of allImages) {
            if (!existingSet.has(f)) mdx.images.push(f)
          }
          if (!mdx.cover || !mdx.images.includes(mdx.cover)) {
            mdx.cover = mdx.images.find((f) => /\.(webp|avif)$/i.test(f)) || mdx.images.find((f) => !f.includes('-preview.')) || mdx.images[0] || ''
          }
          await writeMdx(slug, { title: mdx.title, date: mdx.date, tags: mdx.tags, cover: mdx.cover, images: mdx.images })
          await invalidateGalleryCache()
          spawnRebuild()
          return { ok: true, files: processed }
        } catch (err) {
          console.error('admin gallery images upload failed', err)
          set.status = 500
          return { error: 'Unable to upload images' }
        }
      })()
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .patch('/:slug', async ({ params, body, set }) => {
      const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const entryDir = path.join(GALLERY_ROOT, slug)
      try { await access(entryDir) } catch {
        set.status = 404
        return { error: 'Entry not found' }
      }

      const mdx = await readMdxMeta(entryDir, slug)

      const b = (body || {}) as Record<string, unknown>
      if (typeof b.title === 'string') mdx.title = b.title.trim()
      if (typeof b.date === 'string') mdx.date = b.date.trim()
      if (Array.isArray(b.tags)) mdx.tags = b.tags.map(String)

      const imgFiles = await readdir(entryDir)
      const allImages = imgFiles.filter((f) => GALLERY_IMG_EXT.has(path.extname(f).toLowerCase()) && !f.includes('-preview.'))
      if (Array.isArray(b.images)) {
        const existingSet = new Set(allImages)
        mdx.images = b.images.filter((f: unknown) => typeof f === 'string' && existingSet.has(f))
      } else {
        const existingSet = new Set(mdx.images)
        for (const f of allImages) {
          if (!existingSet.has(f)) mdx.images.push(f)
        }
      }
      if (!mdx.cover || !mdx.images.includes(mdx.cover)) {
        mdx.cover = mdx.images.find((f) => !f.includes('-preview.')) || mdx.images[0] || ''
      }

      try {
        await writeMdx(slug, mdx)
        await invalidateGalleryCache()
        spawnRebuild()
        return { ok: true }
      } catch (err) {
        console.error('admin gallery patch failed', err)
        set.status = 500
        return { error: 'Unable to update entry' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:slug', async ({ params, set }) => {
      const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const entryDir = path.join(GALLERY_ROOT, slug)
      try { await access(entryDir) } catch {
        set.status = 404
        return { error: 'Entry not found' }
      }
      try {
        await rm(entryDir, { recursive: true, force: true })
        await invalidateGalleryCache()
        spawnRebuild()
        return { ok: true }
      } catch (err) {
        console.error('admin gallery delete failed', err)
        set.status = 500
        return { error: 'Unable to delete entry' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/:slug/images/reorder', async ({ params, body, set }) => {
      const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const entryDir = path.join(GALLERY_ROOT, slug)
      try { await access(entryDir) } catch {
        set.status = 404
        return { error: 'Entry not found' }
      }

      const b = (body || {}) as Record<string, unknown>
      const order = Array.isArray(b.order) ? b.order as string[] : []
      if (order.length === 0) {
        set.status = 400
        return { error: 'Order array required' }
      }

      try {
        const mdx = await readMdxMeta(entryDir, slug)

        const allExisting = new Set(mdx.images)
        const filteredOrder = order.filter((f) => allExisting.has(f))
        mdx.images = filteredOrder
        mdx.cover = filteredOrder.find((f) => !f.includes('-preview.')) || filteredOrder[0] || ''
        await writeMdx(slug, mdx)
        await invalidateGalleryCache()
        spawnRebuild()
        return { ok: true }
      } catch (err) {
        console.error('admin gallery images reorder failed', err)
        set.status = 500
        return { error: 'Unable to reorder images' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:slug/images/:filename', async ({ params, set }) => {
      const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
      const filename = String(params.filename).replace(/^\uFEFF/, '').replace(/[^a-z0-9._-]/gi, '')
      if (!slug || !filename) {
        set.status = 400
        return { error: 'Invalid params' }
      }
      const entryDir = path.join(GALLERY_ROOT, slug)
      const targetFile = path.resolve(entryDir, filename)
      if (!targetFile.startsWith(GALLERY_ROOT + path.sep)) {
        set.status = 400
        return { error: 'Invalid path' }
      }

      try {
        await rm(targetFile, { force: true })
        const ext = path.extname(filename).toLowerCase()
        const base = path.basename(filename, ext)
        await rm(path.join(entryDir, `${base}.webp`), { force: true })
        await rm(path.join(entryDir, `${base}.avif`), { force: true })
        await rm(path.join(entryDir, `${base}-preview.webp`), { force: true })

        const imgFiles = await readdir(entryDir)
        const remaining = imgFiles.filter((f) => GALLERY_IMG_EXT.has(path.extname(f).toLowerCase()) && !f.includes('-preview.'))

        const mdx = await readMdxMeta(entryDir, slug)
        await writeMdx(slug, { ...mdx, cover: remaining[0] || '', images: remaining })
        await invalidateGalleryCache()
        spawnRebuild()
        return { ok: true }
      } catch (err) {
        console.error('admin gallery image delete failed', err)
        set.status = 500
        return { error: 'Unable to delete image' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/reorder', async ({ body, set }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const order = Array.isArray(b.order) ? b.order as string[] : []
        if (order.length === 0) {
          set.status = 400
          return { error: 'Order array required' }
        }
        await setOrder(GALLERY_ROOT, order)
        return { ok: true }
      } catch (err) {
        console.error('admin gallery reorder failed', err)
        set.status = 500
        return { error: 'Unable to reorder' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
